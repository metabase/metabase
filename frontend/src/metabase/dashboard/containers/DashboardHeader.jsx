/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import { getIsNavbarOpen } from "metabase/redux/app";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";
import EntityMenu from "metabase/components/EntityMenu";

import Bookmark from "metabase/entities/bookmarks";

import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import {
  DashboardHeaderButton,
  DashboardHeaderActionDivider,
} from "./DashboardHeader.styled";

import ParametersPopover from "metabase/dashboard/components/ParametersPopover";
import DashboardBookmark from "metabase/dashboard/components/DashboardBookmark";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import {
  getIsBookmarked,
  getIsShowDashboardInfoSidebar,
} from "metabase/dashboard/selectors";

import Header from "../components/DashboardHeader";
import { SIDEBAR_NAME } from "../constants";

const mapStateToProps = (state, props) => {
  return {
    isBookmarked: getIsBookmarked(state, props),
    isNavBarOpen: getIsNavbarOpen(state),
    isShowingDashboardInfoSidebar: getIsShowDashboardInfoSidebar(state),
  };
};

const mapDispatchToProps = {
  createBookmark: ({ id }) =>
    Bookmark.actions.create({ id, type: "dashboard" }),
  deleteBookmark: ({ id }) =>
    Bookmark.actions.delete({ id, type: "dashboard" }),
  onChangeLocation: push,
};

class DashboardHeader extends Component {
  constructor(props) {
    super(props);

    this.addQuestionModal = React.createRef();
    this.handleToggleBookmark = this.handleToggleBookmark.bind(this);
  }

  state = {
    modal: null,
  };

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    isEditable: PropTypes.bool.isRequired,
    isEditing: PropTypes.oneOfType([PropTypes.bool, PropTypes.object])
      .isRequired,
    isFullscreen: PropTypes.bool.isRequired,
    isNavBarOpen: PropTypes.bool.isRequired,
    isNightMode: PropTypes.bool.isRequired,
    isAdditionalInfoVisible: PropTypes.bool,

    refreshPeriod: PropTypes.number,
    setRefreshElapsedHook: PropTypes.func.isRequired,

    addCardToDashboard: PropTypes.func.isRequired,
    addTextDashCardToDashboard: PropTypes.func.isRequired,
    fetchDashboard: PropTypes.func.isRequired,
    saveDashboardAndCards: PropTypes.func.isRequired,
    setDashboardAttribute: PropTypes.func.isRequired,

    onEditingChange: PropTypes.func.isRequired,
    onRefreshPeriodChange: PropTypes.func.isRequired,
    onNightModeChange: PropTypes.func.isRequired,
    onFullscreenChange: PropTypes.func.isRequired,

    onSharingClick: PropTypes.func.isRequired,

    onChangeLocation: PropTypes.func.isRequired,

    setSidebar: PropTypes.func.isRequired,
    closeSidebar: PropTypes.func.isRequired,
  };

  handleEdit(dashboard) {
    this.props.onEditingChange(dashboard);
  }

  handleToggleBookmark() {
    const { createBookmark, deleteBookmark, isBookmarked } = this.props;

    const toggleBookmark = isBookmarked ? deleteBookmark : createBookmark;

    toggleBookmark(this.props.dashboardId);
  }

  onAddTextBox() {
    this.props.addTextDashCardToDashboard({ dashId: this.props.dashboard.id });
  }

  onDoneEditing() {
    this.props.onEditingChange(false);
  }

  onRevert() {
    this.props.fetchDashboard(
      this.props.dashboard.id,
      this.props.location.query,
      true,
    );
  }

  async onSave() {
    await this.props.saveDashboardAndCards(this.props.dashboard.id);
    this.onDoneEditing();
  }

  async onCancel() {
    this.onRevert();
    this.onDoneEditing();
  }

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
        onClick={() => this.onCancel()}
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
      isEditable,
      location,
      onToggleAddQuestionSidebar,
      showAddQuestionSidebar,
      onFullscreenChange,
      createBookmark,
      deleteBookmark,
      setSidebar,
      isShowingDashboardInfoSidebar,
      closeSidebar,
    } = this.props;

    const canEdit = dashboard.can_write && isEditable && !!dashboard;

    const buttons = [];
    const extraButtons = [];

    if (isFullscreen && parametersWidget) {
      buttons.push(parametersWidget);
    }

    if (isEditing) {
      const addQuestionButtonHint = showAddQuestionSidebar
        ? t`Close sidebar`
        : t`Add questions`;

      buttons.push(
        <Tooltip tooltip={addQuestionButtonHint}>
          <DashboardHeaderButton
            icon="add"
            isActive={showAddQuestionSidebar}
            onClick={onToggleAddQuestionSidebar}
            data-metabase-event="Dashboard;Add Card Sidebar"
          />
        </Tooltip>,
      );

      // Add text card button
      buttons.push(
        <Tooltip key="add-a-text-box" tooltip={t`Add a text box`}>
          <a
            data-metabase-event="Dashboard;Add Text Box"
            key="add-text"
            className="text-brand-hover cursor-pointer"
            onClick={() => this.onAddTextBox()}
          >
            <DashboardHeaderButton>
              <Icon name="string" size={18} />
            </DashboardHeaderButton>
          </a>
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
                >
                  <Icon name="filter" />
                </DashboardHeaderButton>
              </Tooltip>
            </div>
          </TippyPopover>
        </span>,
      );

      extraButtons.push({
        title: t`Revision history`,
        icon: "history",
        link: `${location.pathname}/history`,
        event: "Dashboard;Revisions",
      });
    }

    if (!isFullscreen && !isEditing && canEdit) {
      buttons.push(
        <Tooltip key="edit-dashboard" tooltip={t`Edit dashboard`}>
          <DashboardHeaderButton
            key="edit"
            data-metabase-event="Dashboard;Edit"
            icon="pencil"
            className="text-brand-hover cursor-pointer"
            onClick={() => this.handleEdit(dashboard)}
          />
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing) {
      extraButtons.push({
        title: t`Enter fullscreen`,
        icon: "expand",
        action: e => onFullscreenChange(!isFullscreen, !e.altKey),
        event: `Dashboard;Fullscreen Mode;${!isFullscreen}`,
      });

      extraButtons.push({
        title: t`Duplicate`,
        icon: "copy",
        link: `${location.pathname}/copy`,
        event: "Dashboard;Copy",
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

    if (extraButtons.length > 0 && !isEditing) {
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
          <EntityMenu
            key="dashboard-action-menu-button"
            items={extraButtons}
            triggerIcon="ellipsis"
            tooltip={t`Move, archive, and more...`}
          />,
        ],
      );
    }

    return buttons;
  }

  render() {
    const {
      dashboard,
      isEditing,
      isFullscreen,
      isAdditionalInfoVisible,
      setDashboardAttribute,
      setSidebar,
    } = this.props;

    const hasLastEditInfo = dashboard["last-edit-info"] != null;

    return (
      <Header
        headerClassName="wrapper"
        objectType="dashboard"
        analyticsContext="Dashboard"
        dashboard={dashboard}
        isEditing={isEditing}
        isBadgeVisible={!isEditing && !isFullscreen && isAdditionalInfoVisible}
        isLastEditInfoVisible={hasLastEditInfo && isAdditionalInfoVisible}
        isEditingInfo={isEditing}
        isNavBarOpen={this.props.isNavBarOpen}
        headerButtons={this.getHeaderButtons()}
        editWarning={this.getEditWarning(dashboard)}
        editingTitle={t`You're editing this dashboard.`}
        editingButtons={this.getEditingButtons()}
        setDashboardAttribute={setDashboardAttribute}
        onLastEditInfoClick={() => setSidebar({ name: SIDEBAR_NAME.info })}
        onSave={() => this.onSave()}
      />
    );
  }
}

export default _.compose(
  Bookmark.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardHeader);
