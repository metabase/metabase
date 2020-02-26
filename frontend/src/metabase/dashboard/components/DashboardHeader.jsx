/* disable  flow TODO - re-enable after refactoring header */

import React, { Component } from "react";
import ReactDOM from "react-dom";
import { Link } from "react-router";
import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import ActionButton from "metabase/components/ActionButton";
import Icon from "metabase/components/Icon";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import InputBlurChange from "metabase/components/InputBlurChange";
import HeaderModal from "metabase/components/HeaderModal";
import TitleAndDescription from "metabase/components/TitleAndDescription";
import EditBar from "metabase/components/EditBar";
import EditWarning from "metabase/components/EditWarning";

import DashboardEmbedWidget from "../containers/DashboardEmbedWidget";

import AddToDashSelectQuestionModal from "./AddToDashSelectQuestionModal";
import ArchiveDashboardModal from "./ArchiveDashboardModal";

import { getDashboardActions } from "./DashboardActions";

import ParametersPopover from "./ParametersPopover";
import Popover from "metabase/components/Popover";

import * as Urls from "metabase/lib/urls";
import MetabaseSettings from "metabase/lib/settings";
import { getScrollY } from "metabase/lib/dom";

import CollectionBadge from "metabase/questions/components/CollectionBadge";

import type { LocationDescriptor, QueryParams } from "metabase/meta/types";
import type { CardId } from "metabase/meta/types/Card";
import type {
  Parameter,
  ParameterId,
  ParameterOption,
} from "metabase/meta/types/Parameter";
import type {
  DashboardWithCards,
  DashboardId,
  DashCardId,
} from "metabase/meta/types/Dashboard";

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

    /* START editing */

    if (isEditing) {
      /* Parameters */
      buttons.push(
        <span key="add-a-filter">
          <Tooltip tooltip={t`Add a filter`}>
            <a
              key="parameters"
              className={cx("text-brand-hover", {
                "text-brand": this.state.modal === "parameters",
              })}
              title={t`Parameters`}
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

      /* ADD TEXT CARD */
      buttons.push(
        <Tooltip key="add-a-text-box" tooltip={t`Add a text box`}>
          <a
            data-metabase-event="Dashboard;Add Text Box"
            key="add-text"
            title={t`Add a text box`}
            className="text-brand-hover cursor-pointer"
            onClick={() => this.onAddTextBox()}
          >
            <Icon name="string" size={20} />
          </a>
        </Tooltip>,
      );

      /* REVISION HISTORY */
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
    /* END editing*/

    /* IF WE ARE NOT IN FULLSCREEN */
    if (!isFullscreen) {
      /* MOVE */
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
      if (!isEditing) {
        /* COPY */
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
      if (canEdit) {
        /* ADD QUESTION */
        buttons.push(
          <ModalWithTrigger
            key="add-a-question"
            ref="addQuestionModal"
            triggerElement={
              <Tooltip tooltip={t`Add a question`}>
                <span
                  data-metabase-event="Dashboard;Add Card Modal"
                  title={t`Add a question to this dashboard`}
                >
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
        /* EDIT DASHBOARD */
        buttons.push(
          <Tooltip key="edit-dashboard" tooltip={t`Edit dashboard`}>
            <a
              data-metabase-event="Dashboard;Edit"
              key="edit"
              title={t`Edit Dashboard Layout`}
              className="text-brand-hover cursor-pointer"
              onClick={() => this.handleEdit(dashboard)}
            >
              <Icon name="pencil" size={16} />
            </a>
          </Tooltip>,
        );
      }
      if (
        (isPublicLinksEnabled && (isAdmin || dashboard.public_uuid)) ||
        (isEmbeddingEnabled && isAdmin)
      ) {
        buttons.push(
          <DashboardEmbedWidget key="dashboard-embed" dashboard={dashboard} />,
        );
      }
    }

    // EVERYTHING ELSE
    // TODO make these easier to understand
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

export class Header extends Component {
  static defaultProps = {
    headerButtons: [],
    editingTitle: "",
    editingSubtitle: "",
    editingButtons: [],
    headerClassName: "py1 lg-py2 xl-py3 wrapper",
  };

  state = {
    headerHeight: 0,
  };

  componentDidMount() {
    this.updateHeaderHeight();
  }

  componentDidUpdate() {
    const modalIsOpen = !!this.props.headerModalMessage;
    if (modalIsOpen) {
      this.updateHeaderHeight();
    }
  }

  updateHeaderHeight() {
    if (!this.refs.header) {
      return;
    }

    const rect = ReactDOM.findDOMNode(this.refs.header).getBoundingClientRect();
    const headerHeight = rect.top + getScrollY();
    if (this.state.headerHeight !== headerHeight) {
      this.setState({ headerHeight });
    }
  }

  setItemAttribute(attribute: string, event) {
    this.props.setItemAttributeFn(attribute, event.target.value);
  }

  renderEditHeader() {
    if (this.props.isEditing) {
      return (
        <EditBar
          title={this.props.editingTitle}
          subtitle={this.props.editingSubtitle}
          buttons={this.props.editingButtons}
        />
      );
    }
  }

  renderEditWarning() {
    if (this.props.editWarning) {
      return <EditWarning title={this.props.editWarning} />;
    }
  }

  renderHeaderModal() {
    return (
      <HeaderModal
        isOpen={!!this.props.headerModalMessage}
        height={this.state.headerHeight}
        title={this.props.headerModalMessage}
        onDone={this.props.onHeaderModalDone}
        onCancel={this.props.onHeaderModalCancel}
      />
    );
  }

  render() {
    const { item } = this.props;
    let titleAndDescription;
    if (this.props.isEditingInfo) {
      titleAndDescription = (
        <div className="Header-title flex flex-column flex-full bordered rounded my1">
          <InputBlurChange
            className="AdminInput text-bold border-bottom rounded-top h3"
            type="text"
            value={this.props.item.name || ""}
            onChange={this.setItemAttribute.bind(this, "name")}
          />
          <InputBlurChange
            className="AdminInput rounded-bottom h4"
            type="text"
            value={this.props.item.description || ""}
            onChange={this.setItemAttribute.bind(this, "description")}
            placeholder={t`No description yet`}
          />
        </div>
      );
    } else {
      if (this.props.item && this.props.item.id != null) {
        titleAndDescription = (
          <TitleAndDescription
            title={this.props.item.name}
            description={this.props.item.description}
          />
        );
      } else {
        titleAndDescription = (
          <TitleAndDescription
            title={t`New ${this.props.objectType}`}
            description={this.props.item.description}
          />
        );
      }
    }

    const headerButtons = this.props.headerButtons.map(
      (section, sectionIndex) => {
        return (
          section &&
          section.length > 0 && (
            <span
              key={sectionIndex}
              className="Header-buttonSection flex align-center"
            >
              {section.map((button, buttonIndex) => (
                <span key={buttonIndex} className="Header-button">
                  {button}
                </span>
              ))}
            </span>
          )
        );
      },
    );

    return (
      <div>
        {this.renderEditHeader()}
        {this.renderEditWarning()}
        {this.renderHeaderModal()}
        <div
          className={
            "QueryBuilder-section flex align-center " +
            this.props.headerClassName
          }
          ref="header"
        >
          <div className="Entity py3">
            <span className="inline-block mb1">{titleAndDescription}</span>
            {this.props.showBadge && (
              <CollectionBadge
                collectionId={item.collection_id}
                analyticsContext={this.props.analyticsContext}
              />
            )}
          </div>

          <div className="flex align-center flex-align-right">
            {headerButtons}
          </div>
        </div>
        {this.props.children}
      </div>
    );
  }
}
