/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import ActionButton from "metabase/components/ActionButton";
import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal";
import ArchiveDashboardModal from "./ArchiveDashboardModal";
import Header from "metabase/components/Header";
import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import DashboardEmbedWidget from "../containers/DashboardEmbedWidget";

import { getDashboardActions } from "./DashboardActions";

import ParametersPopover from "./ParametersPopover";
import Popover from "metabase/components/Popover";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";

import cx from "classnames";

import type { LocationDescriptor, QueryParams } from "metabase-types/types";
import type { CardId } from "metabase-types/types/Card";
import type {
  Parameter,
  ParameterId,
  ParameterOption,
} from "metabase-types/types/Parameter";
import type {
  DashboardWithCards,
  DashboardId,
  DashCardId,
} from "metabase-types/types/Dashboard";
import { Link } from "react-router";

type Props = {
  location: LocationDescriptor,

  dashboard: DashboardWithCards,

  isAdmin: boolean,
  isEditable: boolean,
  isEditing: false | DashboardWithCards,
  isFullscreen: boolean,
  isNightMode: boolean,

  refreshPeriod: ?number,
  setRefreshElapsedHook: Function,

  parametersWidget: React$Element<*>,

  addCardToDashboard: ({ dashId: DashCardId, cardId: CardId }) => void,
  addTextDashCardToDashboard: ({ dashId: DashCardId }) => void,
  archiveDashboard: (dashboardId: DashboardId) => void,
  fetchDashboard: (dashboardId: DashboardId, queryParams: ?QueryParams) => void,
  saveDashboardAndCards: () => Promise<void>,
  setDashboardAttribute: (attribute: string, value: any) => void,

  addParameter: (option: ParameterOption) => Promise<Parameter>,
  setEditingParameter: (parameterId: ?ParameterId) => void,

  onEditingChange: (isEditing: false | DashboardWithCards) => void,
  onRefreshPeriodChange: (?number) => void,
  onNightModeChange: boolean => void,
  onFullscreenChange: boolean => void,

  onChangeLocation: string => void,
};

type State = {
  modal: null | "parameters",
};

export default class DashboardHeader extends Component {
  props: Props;
  state: State = {
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
    archiveDashboard: PropTypes.func.isRequired,
    fetchDashboard: PropTypes.func.isRequired,
    saveDashboardAndCards: PropTypes.func.isRequired,
    setDashboardAttribute: PropTypes.func.isRequired,

    onEditingChange: PropTypes.func.isRequired,
    onRefreshPeriodChange: PropTypes.func.isRequired,
    onNightModeChange: PropTypes.func.isRequired,
    onFullscreenChange: PropTypes.func.isRequired,
  };

  handleEdit(dashboard: DashboardWithCards) {
    this.props.onEditingChange(dashboard);
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

  async onArchive() {
    const { dashboard } = this.props;
    // TODO - this should use entity action
    await this.props.archiveDashboard(dashboard.id);
    this.props.onChangeLocation(Urls.collection(dashboard.collection_id));
  }

  getEditWarning(dashboard: DashboardWithCards) {
    if (dashboard.embedding_params) {
      const currentSlugs = Object.keys(dashboard.embedding_params);
      // are all of the original embedding params keys in the current
      // embedding params keys?
      if (
        this.props.isEditing &&
        !Object.keys(this.props.isEditing.embedding_params).every(slug =>
          currentSlugs.includes(slug),
        )
      ) {
        return "You've updated embedded params and will need to update your embed code.";
      }
    }
  }

  getEditingButtons() {
    return [
      <a
        data-metabase-event="Dashboard;Cancel Edits"
        key="cancel"
        className="Button Button--small"
        onClick={() => this.onCancel()}
      >
        {t`Cancel`}
      </a>,
      <ModalWithTrigger
        key="archive"
        ref="archiveDashboardModal"
        triggerClasses="Button Button--small"
        triggerElement={t`Archive`}
      >
        <ArchiveDashboardModal
          onArchive={() => this.onArchive(this.props.dashboard)}
          onClose={() => this.refs.archiveDashboardModal.toggle()}
        />
      </ModalWithTrigger>,
      <ActionButton
        key="save"
        actionFn={() => this.onSave()}
        className="Button Button--small Button--primary"
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
      isEditing,
      isFullscreen,
      isEditable,
      isAdmin,
      location,
    } = this.props;
    const isEmpty = !dashboard || dashboard.ordered_cards.length === 0;
    const canEdit = dashboard.can_write && isEditable && !!dashboard;

    const isPublicLinksEnabled = MetabaseSettings.get("enable-public-sharing");
    const isEmbeddingEnabled = MetabaseSettings.get("enable-embedding");

    const buttons = [];

    if (isFullscreen && parametersWidget) {
      buttons.push(parametersWidget);
    }

    if (!isFullscreen && canEdit) {
      buttons.push(
        <ModalWithTrigger
          key="add-a-question"
          ref="addQuestionModal"
          triggerElement={
            <Tooltip tooltip={t`Add a question`}>
              <span data-metabase-event="Dashboard;Add Card Modal">
                <Icon
                  className={cx("text-brand-hover cursor-pointer", {
                    "Icon--pulse": isEmpty,
                  })}
                  name="add"
                  size={16}
                />
              </span>
            </Tooltip>
          }
        >
          <AddToDashSelectQuestionModal
            dashboard={dashboard}
            addCardToDashboard={this.props.addCardToDashboard}
            onEditingChange={this.props.onEditingChange}
            onClose={() => this.refs.addQuestionModal.toggle()}
          />
        </ModalWithTrigger>,
      );
    }

    if (isEditing) {
      // Parameters
      buttons.push(
        <span key="add-a-filter">
          <Tooltip tooltip={t`Add a filter`}>
            <a
              key="parameters"
              className={cx("text-brand-hover", {
                "text-brand": this.state.modal === "parameters",
              })}
              onClick={() => this.setState({ modal: "parameters" })}
            >
              <Icon name="funnel_add" size={16} />
            </a>
          </Tooltip>

          {this.state.modal && this.state.modal === "parameters" && (
            <Popover onClose={() => this.setState({ modal: null })}>
              <ParametersPopover
                onAddParameter={this.props.addParameter}
                onClose={() => this.setState({ modal: null })}
              />
            </Popover>
          )}
        </span>,
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
            <Icon name="string" size={20} />
          </a>
        </Tooltip>,
      );

      buttons.push(
        <Tooltip key="revision-history" tooltip={t`Revision history`}>
          <Link
            to={location.pathname + "/history"}
            data-metabase-event={"Dashboard;Revisions"}
          >
            <Icon className="text-brand-hover" name="history" size={18} />
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
            <Icon name="pencil" size={16} />
          </a>
        </Tooltip>,
      );
    }

    if (!isFullscreen && !isEditing) {
      if (canEdit) {
        buttons.push(
          <Tooltip key="new-dashboard" tooltip={t`Move dashboard`}>
            <Link
              to={location.pathname + "/move"}
              data-metabase-event={"Dashboard;Move"}
            >
              <Icon className="text-brand-hover" name="move" size={18} />
            </Link>
          </Tooltip>,
        );
      }
      buttons.push(
        <Tooltip key="copy-dashboard" tooltip={t`Duplicate dashboard`}>
          <Link
            to={location.pathname + "/copy"}
            data-metabase-event={"Dashboard;Copy"}
          >
            <Icon className="text-brand-hover" name="clone" size={18} />
          </Link>
        </Tooltip>,
      );
    }

    if (
      !isFullscreen &&
      ((isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
        (isEmbeddingEnabled && isAdmin))
    ) {
      buttons.push(
        <DashboardEmbedWidget key="dashboard-embed" dashboard={dashboard} />,
      );
    }

    buttons.push(...getDashboardActions(this.props));

    return [buttons];
  }

  render() {
    const { dashboard } = this.props;

    return (
      <Header
        headerClassName="wrapper"
        objectType="dashboard"
        analyticsContext="Dashboard"
        item={dashboard}
        isEditing={this.props.isEditing}
        showBadge={!this.props.isEditing && !this.props.isFullscreen}
        isEditingInfo={this.props.isEditing}
        headerButtons={this.getHeaderButtons()}
        editWarning={this.getEditWarning(dashboard)}
        editingTitle={t`You are editing a dashboard`}
        editingButtons={this.getEditingButtons()}
        setItemAttributeFn={this.props.setDashboardAttribute}
        headerModalMessage={
          this.props.isEditingParameter
            ? t`Select the field that should be filtered for each card`
            : null
        }
        onHeaderModalDone={() => this.props.setEditingParameter(null)}
      />
    );
  }
}
