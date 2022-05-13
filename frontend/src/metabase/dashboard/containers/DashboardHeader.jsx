/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";

import ActionButton from "metabase/components/ActionButton";
import Button from "metabase/core/components/Button";
import Header from "metabase/components/Header";
import Icon from "metabase/components/Icon";
import Tooltip from "metabase/components/Tooltip";

import Bookmark from "metabase/entities/bookmarks";
import { getDashboardActions } from "metabase/dashboard/components/DashboardActions";
import { DashboardHeaderButton } from "./DashboardHeader.styled";

import ParametersPopover from "metabase/dashboard/components/ParametersPopover";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import { getIsBookmarked } from "metabase/dashboard/selectors";

import cx from "classnames";

import { Link } from "react-router";

const mapStateToProps = (state, props) => {
  return {
    isBookmarked: getIsBookmarked(state, props),
  };
};

const mapDispatchToProps = {
  createBookmark: id => Bookmark.actions.create({ id, type: "dashboard" }),
  deleteBookmark: id => Bookmark.actions.delete({ id, type: "dashboard" }),
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
    isNightMode: PropTypes.bool.isRequired,

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
            isActive={showAddQuestionSidebar}
            onClick={onToggleAddQuestionSidebar}
            data-metabase-event="Dashboard;Add Card Sidebar"
          >
            <Icon name="add" />
          </DashboardHeaderButton>
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
                <a
                  key="parameters"
                  className={cx("text-brand-hover", {
                    "text-brand": isAddParameterPopoverOpen,
                  })}
                  onClick={showAddParameterPopover}
                >
                  <DashboardHeaderButton>
                    <Icon name="filter" />
                  </DashboardHeaderButton>
                </a>
              </Tooltip>
            </div>
          </TippyPopover>
        </span>,
      );

      extraButtons.push(
        <Tooltip key="revision-history" tooltip={t`Revision history`}>
          <Link
            to={location.pathname + "/history"}
            data-metabase-event={"Dashboard;Revisions"}
          >
            {t`Revision history`}
          </Link>
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing && canEdit) {
      buttons.push(
        <Tooltip key="edit-dashboard" tooltip={t`Edit dashboard`}>
          <a
            data-metabase-event="Dashboard;Edit"
            key="edit"
            className="text-brand-hover cursor-pointer"
            onClick={() => this.handleEdit(dashboard)}
          >
            <DashboardHeaderButton>
              <Icon name="pencil" />
            </DashboardHeaderButton>
          </a>
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing) {
      const extraButtonClassNames =
        "bg-brand-hover text-white-hover py2 px3 text-bold block cursor-pointer";

      if (canEdit) {
        extraButtons.push(
          <Link
            className={extraButtonClassNames}
            to={location.pathname + "/details"}
            data-metabase-event={"Dashboard;EditDetails"}
          >
            {t`Edit dashboard details`}
          </Link>,
        );
      }

      extraButtons.push(
        <div
          className={extraButtonClassNames}
          onClick={this.handleToggleBookmark}
        >
          {isBookmarked ? t`Remove from bookmarks` : t`Bookmark`}
        </div>,
      );

      extraButtons.push(
        <Link
          className={extraButtonClassNames}
          to={location.pathname + "/history"}
          data-metabase-event={"Dashboard;EditDetails"}
        >
          {t`Revision history`}
        </Link>,
      );

      extraButtons.push(
        <Link
          className={extraButtonClassNames}
          to={location.pathname + "/copy"}
          data-metabase-event={"Dashboard;Copy"}
        >
          {t`Duplicate`}
        </Link>,
      );

      if (canEdit) {
        extraButtons.push(
          <Link
            className={extraButtonClassNames}
            to={location.pathname + "/move"}
            data-metabase-event={"Dashboard;Move"}
          >
            {t`Move`}
          </Link>,
        );
      }

      if (canEdit) {
        extraButtons.push(
          <Link
            className={extraButtonClassNames}
            to={location.pathname + "/archive"}
            data-metabase-event={"Dashboard;Archive"}
          >
            {t`Archive`}
          </Link>,
        );
      }
    }

    buttons.push(...getDashboardActions(this, this.props));

    if (extraButtons.length > 0 && !isEditing) {
      buttons.push(
        <TippyPopoverWithTrigger
          key="extra-actions-menu"
          placement="bottom-end"
          renderTrigger={({ onClick }) => (
            <DashboardHeaderButton onClick={onClick}>
              <Icon name="ellipsis" size={20} className="text-brand-hover" />
            </DashboardHeaderButton>
          )}
          popoverContent={
            <div className="py1">
              {extraButtons.map((b, i) => (
                <div key={i}>{b}</div>
              ))}
            </div>
          }
        />,
      );
    }

    return [buttons];
  }

  render() {
    const { dashboard, location, onChangeLocation } = this.props;

    return (
      <Header
        headerClassName="wrapper"
        objectType="dashboard"
        analyticsContext="Dashboard"
        item={dashboard}
        isEditing={this.props.isEditing}
        hasBadge={!this.props.isEditing && !this.props.isFullscreen}
        isEditingInfo={this.props.isEditing}
        headerButtons={this.getHeaderButtons()}
        editWarning={this.getEditWarning(dashboard)}
        editingTitle={t`You're editing this dashboard.`}
        editingButtons={this.getEditingButtons()}
        setItemAttributeFn={this.props.setDashboardAttribute}
        onLastEditInfoClick={() =>
          onChangeLocation(`${location.pathname}/history`)
        }
      />
    );
  }
}

export default _.compose(
  Bookmark.loadList(),
  connect(mapStateToProps, mapDispatchToProps),
)(DashboardHeader);
