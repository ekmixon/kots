import React from "react";
import { Link, withRouter } from "react-router-dom";
import ReactTooltip from "react-tooltip"

import dayjs from "dayjs";
import MarkdownRenderer from "@src/components/shared/MarkdownRenderer";
import Modal from "react-modal";
import AirgapUploadProgress from "../AirgapUploadProgress";
import Loader from "../shared/Loader";
import MountAware from "../shared/MountAware";
import ShowLogsModal from "@src/components/modals/ShowLogsModal";
import DeployWarningModal from "../shared/modals/DeployWarningModal";
import classNames from "classnames";

import { Utilities, getPreflightResultState, isAwaitingResults } from "@src/utilities/utilities";

import "../../scss/components/watches/DashboardCard.scss";

class DashboardVersionCard extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      selectedAction: "",
      logsLoading: false,
      logs: null,
      selectedTab: null,
      displayConfirmDeploymentModal: false,
    }
    this.cardTitleText = React.createRef();
  }

  componentDidMount() {
    if (this.props.links && this.props.links.length > 0) {
      this.setState({ selectedAction: this.props.links[0] })
    }
  }

  componentDidUpdate(lastProps) {
    if (this.props.links !== lastProps.links && this.props.links && this.props.links.length > 0) {
      this.setState({ selectedAction: this.props.links[0] })
    }
  }

  hideLogsModal = () => {
    this.setState({
      showLogsModal: false
    });
  }

  renderLogsTabs = () => {
    const { logs, selectedTab } = this.state;
    if (!logs) {
      return null;
    }
    const tabs = Object.keys(logs);

    return (
      <div className="flex action-tab-bar u-marginTop--10">
        {tabs.filter(tab => tab !== "renderError").map(tab => (
          <div className={`tab-item blue ${tab === selectedTab && "is-active"}`} key={tab} onClick={() => this.setState({ selectedTab: tab })}>
            {tab}
          </div>
        ))}
      </div>
    );
  }

  handleViewLogs = async (version, isFailing) => {
    try {
      const { app } = this.props;
      const clusterId = app.downstreams?.length && app.downstreams[0].cluster?.id;

      this.setState({ logsLoading: true, showLogsModal: true, viewLogsErrMsg: "" });

      const res = await fetch(`${window.env.API_ENDPOINT}/app/${app?.slug}/cluster/${clusterId}/sequence/${version?.sequence}/downstreamoutput`, {
        headers: {
          "Authorization": Utilities.getToken(),
          "Content-Type": "application/json",
        },
        method: "GET",
      });
      if (res.ok && res.status === 200) {
        const response = await res.json();
        let selectedTab;
        if (isFailing) {
          selectedTab = Utilities.getDeployErrorTab(response.logs);
        } else {
          selectedTab = Object.keys(response.logs)[0];
        }
        this.setState({ logs: response.logs, selectedTab, logsLoading: false, viewLogsErrMsg: "" });
      } else {
        this.setState({ logsLoading: false, viewLogsErrMsg: `Failed to view logs, unexpected status code, ${res.status}` });
      }
    } catch (err) {
      console.log(err)
      this.setState({ logsLoading: false, viewLogsErrMsg: err ? `Failed to view logs: ${err.message}` : "Something went wrong, please try again." });
    }
  }

  getCurrentVersionStatus = (version) => {
    if (version?.status === "deployed" || version?.status === "merged" || version?.status === "pending") {
      return <span className="status-tag success flex-auto">Currently {version?.status.replace("_", " ")} version</span>
    } else if (version?.status === "failed") {
      return <span className="status-tag failed flex-auto">Deploy Failed</span>
    } else if (version?.status === "deploying") {
      return (
        <span className="flex alignItems--center u-fontSize--small u-lineHeight--normal u-textColor--bodyCopy u-fontWeight--medium">
          <Loader className="flex alignItems--center u-marginRight--5" size="16" />
            Deploying
        </span>);
    } else {
      return <span className="status-tag unknown flex-atuo"> {Utilities.toTitleCase(version?.status).replace("_", " ")} </span>
    }
  }

  makeCurrentVersion = async (upstreamSlug, version, isSkipPreflights, continueWithFailedPreflights = false) => {
    try {
      this.setState({ makingCurrentReleaseErrMsg: "" });

      const res = await fetch(`${window.env.API_ENDPOINT}/app/${upstreamSlug}/sequence/${version.sequence}/deploy`, {
        headers: {
          "Authorization": Utilities.getToken(),
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ 
          isSkipPreflights: isSkipPreflights ,
          continueWithFailedPreflights: continueWithFailedPreflights,
          isCLI: false
        }),
      });
      if (res.ok && res.status === 204) {
        this.setState({ makingCurrentReleaseErrMsg: "" });
        this.props.refetchData();
      } else {
        this.setState({
          makingCurrentReleaseErrMsg: `Unable to deploy release ${version.versionLabel}, sequence ${version.sequence}: Unexpected status code: ${res.status}`,
        });
      }
    } catch (err) {
      console.log(err)
      this.setState({
        makingCurrentReleaseErrMsg: err ? `Unable to deploy release ${version.versionLabel}, sequence ${version.sequence}: ${err.message}` : "Something went wrong, please try again.",
      });
    }
  }

  fetchKotsDownstreamHistory = async () => {
    const { match } = this.props;
    const appSlug = match.params.slug;

    this.setState({
      loadingVersionHistory: true,
      errorTitle: "",
      errorMsg: "",
      displayErrorModal: false,
    });

    try {
      const res = await fetch(`${window.env.API_ENDPOINT}/app/${appSlug}/versions`, {
        headers: {
          "Authorization": Utilities.getToken(),
          "Content-Type": "application/json",
        },
        method: "GET",
      });
      if (!res.ok) {
        if (res.status === 401) {
          Utilities.logoutUser();
          return;
        }
        this.setState({
          loadingVersionHistory: false,
          errorTitle: "Failed to get version history",
          errorMsg: `Unexpected status code: ${res.status}`,
          displayErrorModal: true,
        });
        return;
      }
      const response = await res.json();
      const versionHistory = response.versionHistory;

      if (isAwaitingResults(versionHistory)) {
        this.state.versionHistoryJob.start(this.fetchKotsDownstreamHistory, 2000);
      } else {
        this.state.versionHistoryJob.stop();
      }

      this.setState({
        loadingVersionHistory: false,
        versionHistory: versionHistory,
      });
    } catch (err) {
      this.setState({
        loadingVersionHistory: false,
        errorTitle: "Failed to get version history",
        errorMsg: err ? err.message : "Something went wrong, please try again.",
        displayErrorModal: true,
      });
    }
  }

  getPreflightState = (version) => {
    let preflightsFailed = false;
    let preflightState = "";
    if (version.preflightResult) {
      const preflightResult = JSON.parse(version.preflightResult);
      preflightState = getPreflightResultState(preflightResult);
      if (version.status === "pending") {
        preflightsFailed = preflightState === "fail";
      }
    }
    return {
      preflightsFailed,
      preflightState,
      preflightSkipped: version.preflightSkipped
    };
  }

  renderCurrentVersion = () => {
    const { currentVersion, app } = this.props;
    const preflightState = this.getPreflightState(currentVersion);
    
    return (
      <div className="flex1 flex-column">
        {currentVersion?.deployedAt ?
          <div className="flex">
            <div className="flex-column">
              <div className="flex alignItems--center u-marginBottom--5">
                <p className="u-fontSize--header2 u-fontWeight--bold u-lineHeight--medium u-textColor--primary">{currentVersion.versionLabel || currentVersion.title}</p>
                <p className="u-fontSize--small u-textColor--bodyCopy u-fontWeight--medium u-marginLeft--10">Sequence {currentVersion.sequence}</p>
              </div>
              <div>{this.getCurrentVersionStatus(currentVersion)}</div>
              <p className="u-fontSize--small u-fontWeight--medium u-textColor--bodyCopy u-marginTop--10"> {Utilities.dateFormat(currentVersion?.deployedAt, "MMMM D, YYYY @ hh:mm a z")} </p>
            </div>
            <div className="flex flex1 alignItems--center justifyContent--flexEnd">
              {currentVersion?.releaseNotes &&
                <div>
                  <span className="icon releaseNotes--icon u-marginRight--10 u-cursor--pointer" onClick={() => this.showDownstreamReleaseNotes(currentVersion?.releaseNotes)} data-tip="View release notes" />
                  <ReactTooltip effect="solid" className="replicated-tooltip" />
                </div>
              }
              <div>
                <Link to={`/app/${app?.slug}/downstreams/${app?.downstreams[0].cluster?.slug}/version-history/preflight/${currentVersion?.sequence}`}
                  className="icon preflightChecks--icon u-marginRight--10 u-cursor--pointer u-position--relative"
                  data-tip="View preflight checks">
                  {preflightState.preflightsFailed || preflightState.preflightState === "warn" ?
                    <span className={`icon ${preflightState.preflightsFailed ? "preflight-checks-failed-icon" : preflightState.preflightState === "warn" ? "preflight-checks-warn-icon" : ""}`} /> : null
                  }</Link>
                <ReactTooltip effect="solid" className="replicated-tooltip" />
              </div>
              <div>
                <span className="icon deployLogs--icon u-cursor--pointer" onClick={() => this.handleViewLogs(currentVersion, currentVersion?.status === "failed")} data-tip="View deploy logs" />
                <ReactTooltip effect="solid" className="replicated-tooltip" />
              </div>
            </div>
          </div>
          :
          <p className="u-fontWeight--bold u-fontSize--normal u-textColor--bodyCopy" style={{ minHeight: "35px" }}> No version deployed </p>}
      </div>
    )
  }

  getUpdateTypeClassname = (updateType) => {
    if (updateType.includes("Upstream Update")) {
      return "upstream-update";
    }
    if (updateType.includes("Config Change")) {
      return "config-update";
    }
    if (updateType.includes("License Change")) {
      return "license-sync";
    }
    return "online-install";
  }

  getVersionDiffSummary = version => {
    if (!version.diffSummary || version.diffSummary === "") {
      return null;
    }
    try {
      return JSON.parse(version.diffSummary);
    } catch (err) {
      throw err;
    }
  }

  renderSourceAndDiff = version => {
    const { app } = this.props;
    const downstream = app.downstreams?.length && app.downstreams[0];
    const diffSummary = this.getVersionDiffSummary(version);
    const hasDiffSummaryError = version.diffSummaryError && version.diffSummaryError.length > 0;

    if (hasDiffSummaryError) {
      return (
        <div className="flex flex1 alignItems--center">
          <span className="u-fontSize--small u-fontWeight--medium u-lineHeight--normal u-textColor--bodyCopy">Cannot generate diff <span className="replicated-link" onClick={() => this.toggleDiffErrModal(version)}>Why?</span></span>
        </div>
      );
    } else {
      return (
        <div className="u-fontSize--small u-fontWeight--medium u-lineHeight--normal">
          {diffSummary ?
            (diffSummary.filesChanged > 0 ?
              <div
                className="DiffSummary u-cursor--pointer u-marginRight--10"
                onClick={() => {
                  if (!downstream.gitops?.enabled) {
                    this.setState({
                      showDiffOverlay: true,
                      firstSequence: version.parentSequence - 1,
                      secondSequence: version.parentSequence
                    });
                  }
                }}
              >
                <span className="files">{diffSummary.filesChanged} files changed </span>
                <span className="lines-added">+{diffSummary.linesAdded} </span>
                <span className="lines-removed">-{diffSummary.linesRemoved}</span>
              </div>
              :
              <div className="DiffSummary">
                <span className="files">No changes</span>
              </div>
            )
            : <span>&nbsp;</span>}
        </div>
      );
    }
  }

  yamlErrorsDetails = (downstream, version) => {
    const pendingVersion = downstream?.pendingVersions?.find(v => v.sequence === version?.sequence);
    const pastVersion = downstream?.pastVersions?.find(v => v.sequence === version?.sequence);

    if (downstream?.currentVersion?.sequence === version?.sequence) {
      return downstream?.currentVersion?.yamlErrors ? downstream?.currentVersion?.yamlErrors : false;
    } else if (pendingVersion?.yamlErrors) {
      return pendingVersion?.yamlErrors;
    } else if (pastVersion?.yamlErrors) {
      return pastVersion?.yamlErrors;
    } else {
      return false;
    }
  }
  
  deployVersion = (version, force = false, continueWithFailedPreflights = false) => {
    const { app } = this.props;
    const clusterSlug = app.downstreams?.length && app.downstreams[0].cluster?.slug;
    if (!clusterSlug) {
      return;
    }
    const downstream = app.downstreams?.length && app.downstreams[0];
    const yamlErrorDetails = this.yamlErrorsDetails(downstream, version);

    if (!force) {
      if (yamlErrorDetails) {
        this.setState({
          displayShowDetailsModal: !this.state.displayShowDetailsModal,
          deployView: true,
          versionToDeploy: version,
          yamlErrorDetails
        });
        return;
      }
      if (version.status === "pending_preflight") {
        this.setState({
          showSkipModal: true,
          versionToDeploy: version,
          isSkipPreflights: true
        });
        return;
      }
      if (version?.preflightResult && version.status === "pending") {
        const preflightResults = JSON.parse(version.preflightResult);
        const preflightState = getPreflightResultState(preflightResults);
        if (preflightState === "fail") {
          this.setState({
            showDeployWarningModal: true,
            versionToDeploy: version
          });
          return;
        }
      }
      
      // prompt to make sure user wants to deploy
      this.setState({
        displayConfirmDeploymentModal: true,
        versionToDeploy: version,
      });
      return;
    } else { // force deploy is set to true so finalize the deployment
      this.finalizeDeployment(continueWithFailedPreflights);
    }
  }

  finalizeDeployment = async (continueWithFailedPreflights) => {
    const { match, updateCallback } = this.props;
    const { versionToDeploy, isSkipPreflights } = this.state;
    this.setState({ displayConfirmDeploymentModal: false, confirmType: "" });
    await this.makeCurrentVersion(match.params.slug, versionToDeploy, isSkipPreflights, continueWithFailedPreflights);
    await this.fetchKotsDownstreamHistory();
    this.setState({ versionToDeploy: null });

    if (updateCallback && typeof updateCallback === "function") {
      updateCallback();
    }
  }

  onForceDeployClick = (continueWithFailedPreflights = false) => {
    this.setState({ showSkipModal: false, showDeployWarningModal: false, displayShowDetailsModal: false });
    const versionToDeploy = this.state.versionToDeploy;
    this.deployVersion(versionToDeploy, true, continueWithFailedPreflights);
  }

  showDownstreamReleaseNotes = (releaseNotes) => {
    this.setState({
      showDownstreamReleaseNotes: true,
      downstreamReleaseNotes: releaseNotes
    });
  }
  
  deployButtonStatus = (downstream, version) => {
    const isDeploying = version.status === "deploying";
    const needsConfiguration = version.status === "pending_config";
  
    if (needsConfiguration) {
      return "Configure";
    } else if (downstream?.currentVersion?.sequence == undefined) {
      return "Deploy";
    } else if (isDeploying) {
      return "Deploying";
    } else {
      return "Deploy";
    }
  }
  
  renderVersionAction = (version, nothingToCommit) => {
    const { app } = this.props;
    const downstream = app.downstreams[0];
    if (downstream.gitops?.enabled) {
      if (version.gitDeployable === false) {
        return (<div className={nothingToCommit && "u-opacity--half"}>Nothing to commit</div>);
      }
      if (!version.commitUrl) {
        return null;
      }
      return (
        <button
          className="btn primary blue"
          onClick={() => window.open(version.commitUrl, '_blank')}
        >
          View
        </button>
      );
    }
  
    const needsConfiguration = version.status === "pending_config";
    const preflightState = this.getPreflightState(version);
    return (
      <div className="flex flex1 alignItems--center justifyContent--flexEnd">
          {version?.releaseNotes &&
            <div>
              <span className="icon releaseNotes--icon u-marginRight--10 u-cursor--pointer" onClick={() => this.showDownstreamReleaseNotes(version?.releaseNotes)} data-tip="View release notes" />
              <ReactTooltip effect="solid" className="replicated-tooltip" />
            </div>
          }
          <div>
          <Link to={`/app/${app?.slug}/downstreams/${app?.downstreams[0].cluster?.slug}/version-history/preflight/${version?.sequence}`}
            className="icon preflightChecks--icon u-marginRight--10 u-cursor--pointer u-position--relative"
            data-tip="View preflight checks">
            {preflightState.preflightsFailed || preflightState.preflightState === "warn" ?
              <span className={`icon version-row-preflight-status-icon ${preflightState.preflightsFailed ? "preflight-checks-failed-icon" : preflightState.preflightState === "warn" ? "preflight-checks-warn-icon" : ""}`} /> : null
            }</Link>
            <ReactTooltip effect="solid" className="replicated-tooltip" />
          </div>
          {app?.isConfigurable &&
            <div>
              <Link to={`/app/${app?.slug}/config/${version.sequence}`} className="icon configEdit--icon u-cursor--pointer" data-tip="Edit config" />
              <ReactTooltip effect="solid" className="replicated-tooltip" />
            </div>
          }
          <div className="flex-column justifyContent--center">
            <button
              className={classNames("btn u-marginLeft--10", { "secondary blue": needsConfiguration, "primary blue": !needsConfiguration })}
              disabled={version.status === "deploying"}
              onClick={needsConfiguration ? history.push(`/app/${app?.slug}/config/${version.sequence}`) : () => this.deployVersion(version)}
            >
              {this.deployButtonStatus(downstream, version, app)}
            </button>
          </div>
      </div>
    );
  }

  renderVersionAvailable = () => {
    const { app, downstream, checkingForUpdates, checkingForUpdateError, checkingUpdateText, errorCheckingUpdate, isBundleUploading } = this.props;

    let checkingUpdateTextShort = checkingUpdateText;
    if (checkingUpdateTextShort && checkingUpdateTextShort.length > 30) {
      checkingUpdateTextShort = checkingUpdateTextShort.slice(0, 30) + "...";
    }

    const showOnlineUI = !app.isAirgap && !checkingForUpdates;
    const showAirgapUI = app.isAirgap && !isBundleUploading;

    let updateText;
    if (showOnlineUI && app.lastUpdateCheckAt) {
      updateText = <p className="u-marginTop--8 u-fontSize--smaller u-textColor--info u-marginTop--8">Last checked <span className="u-fontWeight--bold">{dayjs(app.lastUpdateCheckAt).fromNow()}</span></p>;
    } else if (this.props.airgapUploadError) {
      updateText = <p className="u-marginTop--10 u-fontSize--small u-textColor--error u-fontWeight--medium">Error uploading bundle <span className="u-linkColor u-textDecoration--underlineOnHover" onClick={this.props.viewAirgapUploadError}>See details</span></p>
    } else if (this.props.uploadingAirgapFile) {
      updateText = (
        <AirgapUploadProgress
          appSlug={app.slug}
          total={this.props.uploadSize}
          progress={this.props.uploadProgress}
          resuming={this.props.uploadResuming}
          onProgressError={this.props.onProgressError}
          smallSize={true}
        />
      );
    } else if (isBundleUploading) {
      updateText = (
        <AirgapUploadProgress
          appSlug={app.slug}
          unkownProgress={true}
          onProgressError={this.onProgressError}
          smallSize={true}
        />);
    } else if (errorCheckingUpdate) {
      updateText = <p className="u-marginTop--10 u-fontSize--small u-textColor--error u-fontWeight--medium">Error checking for updates, please try again</p>
    } else if (checkingForUpdates) {
      updateText = <p className="u-marginTop--10 u-fontSize--small u-textColor--bodyCopy u-fontWeight--medium">{checkingUpdateTextShort}</p>
    } else if (!app.lastUpdateCheckAt) {
      updateText = null;
    }

    const mountAware = this.props.airgapUploader ?
      <MountAware className="u-marginTop--30" onMount={el => this.props.airgapUploader?.assignElement(el)}>
        <button className="btn primary blue">Upload a new version</button>
      </MountAware>
    : null;
    const nothingToCommit = downstream.gitops?.enabled && !downstream?.pendingVersions[0].commitUrl;
    
    return (
      <div>
        {checkingForUpdates && !isBundleUploading
          ? <Loader className="flex justifyContent--center u-marginTop--10" size="32" />
          : showAirgapUI
            ? mountAware
            : showOnlineUI ?
            <div className="flex">
              <div className="flex-column">
                <div className="flex alignItems--center">
                  <p className="u-fontSize--header2 u-fontWeight--bold u-lineHeight--medium u-textColor--primary">{downstream?.pendingVersions[0].versionLabel || downstream?.pendingVersions[0].title}</p>
                  <p className="u-fontSize--small u-textColor--bodyCopy u-fontWeight--medium u-marginLeft--10">Sequence {downstream?.pendingVersions[0].sequence}</p>
                </div>
                <div className="u-marginTop--5 flex flex-auto alignItems--center">
                  <span className={`icon versionUpdateType u-marginRight--5 ${this.getUpdateTypeClassname(downstream?.pendingVersions[0]?.source)}`} data-tip={downstream?.pendingVersions[0]?.source} />
                  <ReactTooltip effect="solid" className="replicated-tooltip" />
                  {this.renderSourceAndDiff(downstream?.pendingVersions[0])}
                </div>
                <p className="u-fontSize--small u-fontWeight--medium u-textColor--bodyCopy u-marginTop--8"> Released {Utilities.dateFormat(downstream?.pendingVersions[0]?.createdOn, "MMMM D, YYYY @ hh:mm a z")} </p>
              </div>
                {this.renderVersionAction(downstream?.pendingVersions[0], nothingToCommit)}
            </div>
              : null
        }
        {!showOnlineUI && updateText}
        {checkingForUpdateError &&
          <div className="flex-column flex-auto u-marginTop--5">
            <p className="u-marginTop--10 u-fontSize--small u-textColor--error u-fontWeight--medium">Error updating version <span className="u-linkColor u-textDecoration--underlineOnHover" onClick={() => this.props.viewAirgapUpdateError(checkingUpdateText)}>View details</span></p>
          </div>}
      </div>
    )
  }

  render() {
    const { downstream } = this.props;
    const { downstreamReleaseNotes } = this.state;
    return (
      <div className="flex-column flex1 dashboard-card">
        <p className="u-fontSize--large u-textColor--primary u-fontWeight--bold u-marginBottom--10">Versions</p>
        <div className="LicenseCard-content--wrapper">
          {this.renderCurrentVersion()}
        </div>
        {downstream?.pendingVersions?.length > 0 ?
          <div className="u-marginTop--30">
            <p className="u-fontSize--normal u-lineHeight--normal u-textColor--header u-fontWeight--medium">New version available</p>
            <div className="LicenseCard-content--wrapper u-marginTop--15">
              {this.renderVersionAvailable()}
            </div>
          </div>
        : null}
        <div className="u-marginTop--10">
          <Link to={`/app/${this.props.app?.slug}/version-history`} className="replicated-link has-arrow u-fontSize--small">See all versions</Link>
        </div>
        {this.state.showDownstreamReleaseNotes &&
          <Modal
            isOpen={this.state.showDownstreamReleaseNotes}
            onRequestClose={() => this.setState({ showDownstreamReleaseNotes: false })}
            contentLabel="Release Notes"
            ariaHideApp={false}
            className="Modal MediumSize"
          >
            <div className="flex-column">
              <MarkdownRenderer>
                {downstreamReleaseNotes || ""}
              </MarkdownRenderer>
            </div>
            <div className="flex u-marginTop--10 u-marginLeft--10 u-marginBottom--10">
              <button className="btn primary" onClick={() => this.setState({ showDownstreamReleaseNotes: false })}>Close</button>
            </div>
          </Modal>
        }
        {this.state.showLogsModal &&
          <ShowLogsModal
            showLogsModal={this.state.showLogsModal}
            hideLogsModal={this.hideLogsModal}
            viewLogsErrMsg={this.state.viewLogsErrMsg}
            logs={this.state.logs}
            selectedTab={this.state.selectedTab}
            logsLoading={this.state.logsLoading}
            renderLogsTabs={this.renderLogsTabs()}
          />}
          {this.state.displayConfirmDeploymentModal &&
            <Modal
              isOpen={true}
              onRequestClose={() => this.setState({ displayConfirmDeploymentModal: false, versionToDeploy: null })}
              contentLabel="Confirm deployment"
              ariaHideApp={false}
              className="Modal DefaultSize"
            >
              <div className="Modal-body">
                <p className="u-fontSize--largest u-fontWeight--bold u-textColor--primary u-lineHeight--normal u-marginBottom--10">Deploy {this.state.versionToDeploy?.versionLabel} (Sequence {this.state.versionToDeploy?.sequence})?</p>
                <div className="flex u-paddingTop--10">
                  <button className="btn secondary blue" onClick={() => this.setState({ displayConfirmDeploymentModal: false, versionToDeploy: null })}>Cancel</button>
                  <button className="u-marginLeft--10 btn primary" onClick={() => this.finalizeDeployment(false)}>Yes, deploy</button>
                </div>
              </div>
            </Modal>
          }
          {this.state.showDeployWarningModal &&
          <DeployWarningModal
            showDeployWarningModal={this.state.showDeployWarningModal}
            hideDeployWarningModal={() => this.setState({ showDeployWarningModal: false })}
            onForceDeployClick={this.onForceDeployClick}
          />}
      </div>
    );
  }
}

export default withRouter(DashboardVersionCard)
