import { Component, Fragment } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import { trackExportDashboardToPDF } from "metabase/dashboard/analytics";

import { getIsNavbarOpen } from "metabase/selectors/app";

import ActionButton from "metabase/components/ActionButton";
import { LeaveConfirmationModalContent } from "metabase/components/LeaveConfirmationModal";
import Modal from "metabase/components/Modal";
import Button from "metabase/core/components/Button";
import { Icon } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";
import EntityMenu from "metabase/components/EntityMenu";

import Bookmark from "metabase/entities/bookmarks";

import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";

import { TextOptionsButton } from "metabase/dashboard/components/TextOptions/TextOptionsButton";
import { ParametersPopover } from "metabase/dashboard/components/ParametersPopover";
import { DashboardBookmark } from "metabase/dashboard/components/DashboardBookmark";
import TippyPopover from "metabase/components/Popover/TippyPopover";

import { getPulseFormInput } from "metabase/pulse/selectors";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import {
  getIsBookmarked,
  getIsShowDashboardInfoSidebar,
} from "metabase/dashboard/selectors";
import {
  addActionToDashboard,
  toggleSidebar,
} from "metabase/dashboard/actions";

import { hasDatabaseActionsEnabled } from "metabase/dashboard/utils";
import { saveDashboardPdf } from "metabase/visualizations/lib/save-dashboard-pdf";
import { getSetting } from "metabase/selectors/settings";
import { dismissAllUndo } from "metabase/redux/undo";

import Link from "metabase/core/components/Link/Link";
import Collections from "metabase/entities/collections/collections";
import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { SIDEBAR_NAME } from "../../constants";
import { DashboardHeaderView } from "./DashboardHeaderView";
import {
  DashboardHeaderButton,
  DashboardHeaderActionDivider,
} from "./DashboardHeader.styled";

const mapStateToProps = (state, props) => {
  return {
    formInput: getPulseFormInput(state, props),
    isBookmarked: getIsBookmarked(state, props),
    isNavBarOpen: getIsNavbarOpen(state),
    isShowingDashboardInfoSidebar: getIsShowDashboardInfoSidebar(state),
    selectedTabId: state.dashboard.selectedTabId,
    isHomepageDashboard:
      getSetting(state, "custom-homepage") &&
      getSetting(state, "custom-homepage-dashboard") === props.dashboard?.id,
  };
};

const mapDispatchToProps = {
  createBookmark: ({ id }) =>
    Bookmark.actions.create({ id, type: "dashboard" }),
  deleteBookmark: ({ id }) =>
    Bookmark.actions.delete({ id, type: "dashboard" }),
  fetchPulseFormInput,
  onChangeLocation: push,
  toggleSidebar,
  addActionToDashboard,
  dismissAllUndo,
};

class DashboardHeaderContainer extends Component {
  constructor(props) {
    super(props);
    this.handleToggleBookmark = this.handleToggleBookmark.bind(this);
  }

  componentDidMount() {
    this.props.fetchPulseFormInput();
  }

  state = {
    showCancelWarning: false,
  };

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    formInput: PropTypes.object.isRequired,
    isAdmin: PropTypes.bool,
    isDirty: PropTypes.bool,
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isFullscreen: PropTypes.bool.isRequired,
    isNavBarOpen: PropTypes.bool.isRequired,
    isNightMode: PropTypes.bool.isRequired,
    isAdditionalInfoVisible: PropTypes.bool,

    refreshPeriod: PropTypes.number,
    setRefreshElapsedHook: PropTypes.func.isRequired,

    addCardToDashboard: PropTypes.func.isRequired,
    addHeadingDashCardToDashboard: PropTypes.func.isRequired,
    addMarkdownDashCardToDashboard: PropTypes.func.isRequired,
    addLinkDashCardToDashboard: PropTypes.func.isRequired,
    fetchDashboard: PropTypes.func.isRequired,
    updateDashboardAndCards: PropTypes.func.isRequired,
    setDashboardAttribute: PropTypes.func.isRequired,
    dismissAllUndo: PropTypes.func.isRequired,

    onEditingChange: PropTypes.func.isRequired,
    onRefreshPeriodChange: PropTypes.func.isRequired,
    onNightModeChange: PropTypes.func.isRequired,
    onFullscreenChange: PropTypes.func.isRequired,

    onSharingClick: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,

    toggleSidebar: PropTypes.func.isRequired,
    sidebar: PropTypes.shape({
      name: PropTypes.string,
      props: PropTypes.object,
    }).isRequired,
    setSidebar: PropTypes.func.isRequired,
    closeSidebar: PropTypes.func.isRequired,
    addActionToDashboard: PropTypes.func.isRequired,

    databases: PropTypes.object,
    collection: PropTypes.object,

    dashboardId: PropTypes.number,
    selectedTabId: PropTypes.number,

    location: PropTypes.shape({
      query: PropTypes.object,
      pathname: PropTypes.string,
    }),

    createBookmark: PropTypes.func,
    deleteBookmark: PropTypes.func,
    isBookmarked: PropTypes.bool,
    dashboardBeforeEditing: PropTypes.object,
    parametersWidget: PropTypes.node,
    isShowingDashboardInfoSidebar: PropTypes.bool,
    isAddParameterPopoverOpen: PropTypes.bool,
    showAddParameterPopover: PropTypes.func,
    hideAddParameterPopover: PropTypes.func,
    addParameter: PropTypes.func,
    isHomepageDashboard: PropTypes.bool,
  };

  handleEdit(dashboard) {
    this.props.onEditingChange(dashboard);
  }

  handleCancelWarningClose = () => {
    this.setState({ showCancelWarning: false });
  };

  handleToggleBookmark() {
    const { createBookmark, deleteBookmark, isBookmarked } = this.props;

    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

    toggleBookmark(this.props.dashboardId);
  }

  onAddMarkdownBox() {
    this.props.addMarkdownDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddHeading() {
    this.props.addHeadingDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddLinkCard() {
    this.props.addLinkDashCardToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
    });
  }

  onAddAction() {
    this.props.addActionToDashboard({
      dashId: this.props.dashboard.id,
      tabId: this.props.selectedTabId,
      displayType: "button",
      action: {},
    });
  }

  onDoneEditing() {
    this.props.onEditingChange(false);
  }

  onRevert() {
    this.props.fetchDashboard({
      dashId: this.props.dashboard.id,
      queryParams: this.props.location.query,
      options: { preserveParameters: true },
    });
  }

  async onSave() {
    // optimistically dismissing all the undos before the saving has finished
    // clicking on them wouldn't do anything at this moment anyway
    this.props.dismissAllUndo();
    await this.props.updateDashboardAndCards();
    this.onDoneEditing();
  }

  onRequestCancel = () => {
    const { isDirty, isEditing } = this.props;

    if (isDirty && isEditing) {
      this.setState({ showCancelWarning: true });
    } else {
      this.onCancel();
    }
  };

  onCancel = () => {
    this.onRevert();
    this.onDoneEditing();
  };

  getEditWarning(dashboard) {
    if (dashboard.embedding_params) {
      const currentSlugs = Object.keys(dashboard.embedding_params);
      // are all of the original embedding params keys in the current
      // embedding params keys?
      if (
        this.props.isEditing &&
        this.props.dashboardBeforeEditing &&
        Object.keys(this.props.dashboardBeforeEditing.embedding_params).some(
          slug => !currentSlugs.includes(slug),
        )
      ) {
        return t`You've updated embedded params and will need to update your embed code.`;
      }
    }
  }

  getEditingButtons() {
    return [
      <Button
        data-metabase-event="Dashboard;Cancel Edits"
        key="cancel"
        className="Button Button--small mr1"
        onClick={this.onRequestCancel}
      >
        {t`Cancel`}
      </Button>,
      <ActionButton
        key="save"
        actionFn={() => this.onSave()}
        className="Button Button--primary Button--small"
        normalText={t`Save`}
        activeText={t`Saving…`}
        failedText={t`Save failed`}
        successText={t`Saved`}
      />,
    ];
  }

  getHeaderButtons() {
    const {
      dashboard,
      parametersWidget,
      isBookmarked,
      isEditing,
      isFullscreen,
      location,
      onFullscreenChange,
      createBookmark,
      deleteBookmark,
      sidebar,
      setSidebar,
      toggleSidebar,
      isShowingDashboardInfoSidebar,
      closeSidebar,
      databases,
      collection,
    } = this.props;

    const canEdit = dashboard.can_write;
    const isAnalyticsDashboard = isInstanceAnalyticsCollection(collection);

    const hasModelActionsEnabled = Object.values(databases).some(
      hasDatabaseActionsEnabled,
    );

    const buttons = [];
    const extraButtons = [];

    if (isFullscreen && parametersWidget) {
      buttons.push(parametersWidget);
    }

    if (isEditing) {
      const activeSidebarName = sidebar.name;
      const addQuestionButtonHint =
        activeSidebarName === SIDEBAR_NAME.addQuestion
          ? t`Close sidebar`
          : t`Add questions`;

      buttons.push(
        <Tooltip key="add-question-element" tooltip={addQuestionButtonHint}>
          <DashboardHeaderButton
            icon="add"
            isActive={activeSidebarName === SIDEBAR_NAME.addQuestion}
            onClick={() => toggleSidebar(SIDEBAR_NAME.addQuestion)}
            aria-label={t`Add questions`}
            data-metabase-event="Dashboard;Add Card Sidebar"
          />
        </Tooltip>,
      );

      // Text/Headers
      buttons.push(
        <Tooltip
          key="dashboard-add-heading-or-text-button"
          tooltip={t`Add a heading or text`}
        >
          <TextOptionsButton
            onAddMarkdown={() => this.onAddMarkdownBox()}
            onAddHeading={() => this.onAddHeading()}
          />
        </Tooltip>,
      );

      // Add link card button
      buttons.push(
        <Tooltip key="add-link-card" tooltip={t`Add link card`}>
          <DashboardHeaderButton
            onClick={() => this.onAddLinkCard()}
            data-metabase-event={`Dashboard;Add Link Card`}
          >
            <Icon name="link" size={18} />
          </DashboardHeaderButton>
        </Tooltip>,
      );

      const {
        isAddParameterPopoverOpen,
        showAddParameterPopover,
        hideAddParameterPopover,
        addParameter,
      } = this.props;

      // Parameters
      buttons.push(
        <span key="add-a-filter">
          <TippyPopover
            placement="bottom-start"
            onClose={hideAddParameterPopover}
            visible={isAddParameterPopoverOpen}
            content={
              <ParametersPopover
                onAddParameter={addParameter}
                onClose={hideAddParameterPopover}
              />
            }
          >
            <div>
              <Tooltip tooltip={t`Add a filter`}>
                <DashboardHeaderButton
                  key="parameters"
                  onClick={showAddParameterPopover}
                  aria-label={t`Add a filter`}
                >
                  <Icon name="filter" />
                </DashboardHeaderButton>
              </Tooltip>
            </div>
          </TippyPopover>
        </span>,
      );

      if (canEdit && hasModelActionsEnabled) {
        buttons.push(
          <Fragment key="add-action-element">
            <DashboardHeaderActionDivider />
            <Tooltip key="add-action-button" tooltip={t`Add action button`}>
              <DashboardHeaderButton
                onClick={() => this.onAddAction()}
                aria-label={t`Add action`}
                data-metabase-event={`Dashboard;Add Action Button`}
              >
                <Icon name="click" size={18} />
              </DashboardHeaderButton>
            </Tooltip>
          </Fragment>,
        );
      }

      extraButtons.push({
        title: t`Revision history`,
        icon: "history",
        link: `${location.pathname}/history`,
        event: "Dashboard;Revisions",
      });
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <Button
          icon="clone"
          data-metabase-event="Dashboard;Copy"
          to={`${location.pathname}/copy`}
          as={Link}
        >{t`Make a copy`}</Button>,
      );
    }

    if (!isFullscreen && !isEditing && canEdit) {
      buttons.push(
        <Tooltip key="edit-dashboard" tooltip={t`Edit dashboard`}>
          <DashboardHeaderButton
            visibleOnSmallScreen={false}
            key="edit"
            aria-label={t`Edit dashboard`}
            data-metabase-event="Dashboard;Edit"
            icon="pencil"
            onClick={() => this.handleEdit(dashboard)}
          />
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing && !isAnalyticsDashboard) {
      extraButtons.push({
        title: t`Enter fullscreen`,
        icon: "expand",
        action: e => onFullscreenChange(!isFullscreen, !e.altKey),
        event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
      });

      extraButtons.push({
        title: t`Duplicate`,
        icon: "clone",
        link: `${location.pathname}/copy`,
        event: "Dashboard;Copy",
      });

      extraButtons.push({
        title:
          dashboard.tabs?.length > 1 ? t`Export tab as PDF` : t`Export as PDF`,
        icon: "document",
        testId: "dashboard-export-pdf-button",
        action: () => {
          this.saveAsPDF();
        },
      });

      if (canEdit) {
        extraButtons.push({
          title: t`Move`,
          icon: "move",
          link: `${location.pathname}/move`,
          event: "Dashboard;Move",
        });

        extraButtons.push({
          title: t`Archive`,
          icon: "view_archive",
          link: `${location.pathname}/archive`,
          event: "Dashboard;Archive",
        });
      }
    }

    buttons.push(...getDashboardActions(this, this.props));

    if (!isEditing) {
      buttons.push(
        ...[
          <DashboardHeaderActionDivider key="dashboard-button-divider" />,
          <DashboardBookmark
            key="dashboard-bookmark-button"
            dashboard={dashboard}
            onCreateBookmark={createBookmark}
            onDeleteBookmark={deleteBookmark}
            isBookmarked={isBookmarked}
          />,
          <Tooltip key="dashboard-info-button" tooltip={t`More info`}>
            <DashboardHeaderButton
              icon="info"
              isActive={isShowingDashboardInfoSidebar}
              onClick={() =>
                isShowingDashboardInfoSidebar
                  ? closeSidebar()
                  : setSidebar({ name: SIDEBAR_NAME.info })
              }
            />
          </Tooltip>,
        ].filter(Boolean),
      );

      if (extraButtons.length > 0) {
        buttons.push(
          <EntityMenu
            key="dashboard-action-menu-button"
            triggerAriaLabel="dashboard-menu-button"
            items={extraButtons}
            triggerIcon="ellipsis"
            tooltip={t`Move, archive, and more...`}
          />,
        );
      }
    }

    if (isAnalyticsDashboard) {
      buttons.push(
        <DashboardHeaderButton
          key="expand"
          aria-label={t`Enter Fullscreen`}
          data-metabase-event={`Dashboard;Fullscreen Mode;${!isFullscreen}`}
          icon="expand"
          className="text-brand-hover cursor-pointer"
          onClick={e => onFullscreenChange(!isFullscreen, !e.altKey)}
        />,
      );
    }

    return buttons;
  }

  saveAsPDF = async () => {
    const { dashboard } = this.props;
    const cardNodeSelector = "#Dashboard-Cards-Container";
    await saveDashboardPdf(cardNodeSelector, dashboard.name).then(() => {
      trackExportDashboardToPDF(dashboard.id);
    });
  };

  render() {
    const {
      dashboard,
      collection,
      isEditing,
      isFullscreen,
      isNavBarOpen,
      isAdditionalInfoVisible,
      setDashboardAttribute,
      setSidebar,
      isHomepageDashboard,
    } = this.props;
    const { showCancelWarning } = this.state;
    const hasLastEditInfo = dashboard["last-edit-info"] != null;

    return (
      <>
        <DashboardHeaderView
          headerClassName="wrapper"
          objectType="dashboard"
          analyticsContext="Dashboard"
          location={this.props.location}
          dashboard={dashboard}
          collection={collection}
          isEditing={isEditing}
          isBadgeVisible={
            !isEditing && !isFullscreen && isAdditionalInfoVisible
          }
          isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
          isEditingInfo={isEditing}
          isNavBarOpen={isNavBarOpen}
          headerButtons={this.getHeaderButtons()}
          editWarning={this.getEditWarning(dashboard)}
          editingTitle={t`You're editing this dashboard.`.concat(
            isHomepageDashboard
              ? t` Remember that this dashboard is set as homepage.`
              : "",
          )}
          editingButtons={this.getEditingButtons()}
          setDashboardAttribute={setDashboardAttribute}
          onLastEditInfoClick={() => setSidebar({ name: SIDEBAR_NAME.info })}
        />

        <Modal isOpen={showCancelWarning}>
          <LeaveConfirmationModalContent
            onAction={this.onCancel}
            onClose={this.handleCancelWarningClose}
          />
        </Modal>
      </>
    );
  }
}

export const DashboardHeader = _.compose(
  Bookmark.loadList(),
  Collections.load({
    id: (state, props) => props.dashboard.collection_id || "root",
  }),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardHeaderContainer);
