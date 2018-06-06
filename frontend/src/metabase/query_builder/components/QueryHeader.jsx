import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { connect } from "react-redux";
import { t } from "c-3po";
import { Box } from "rebass"

//import QueryModeButton from "./QueryModeButton.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import AddToDashSelectDashModal from "metabase/containers/AddToDashSelectDashModal.jsx";
import Button from "metabase/components/Button"
import Header from "metabase/components/Header.jsx";
import Icon from "metabase/components/Icon.jsx";
import Modal from "metabase/components/Modal.jsx";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import QuestionSavedModal from "metabase/components/QuestionSavedModal.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import MoveToCollection from "metabase/questions/containers/MoveToCollection.jsx";
import ArchiveQuestionModal from "metabase/query_builder/containers/ArchiveQuestionModal";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal.jsx";

import { clearRequestState } from "metabase/redux/requests";

import { CardApi } from "metabase/services";

import MetabaseAnalytics from "metabase/lib/analytics";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";
import _ from "underscore";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import EntityMenu from "metabase/components/EntityMenu";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { AlertListPopoverContent } from "metabase/query_builder/components/AlertListPopoverContent";
import {
  getQuestionAlerts,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser } from "metabase/home/selectors";
import { fetchAlertsForQuestion } from "metabase/alert/alert";

const mapStateToProps = (state, props) => ({
  questionAlerts: getQuestionAlerts(state),
  visualizationSettings: getVisualizationSettings(state),
  user: getUser(state),
});

const mapDispatchToProps = {
  fetchAlertsForQuestion,
  clearRequestState,
};
const ICON_SIZE = 16;

@connect(mapStateToProps, mapDispatchToProps)
export default class QueryHeader extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      recentlySaved: null,
      modal: null,
      revisions: null,
    };

    _.bindAll(
      this,
      "resetStateOnTimeout",
      "onCreate",
      "onSave",
      "onBeginEditing",
      "onCancel",
      "onDelete",
      "onFollowBreadcrumb",
      "onToggleDataReference",
    );
  }

  static propTypes = {
    question: PropTypes.object.isRequired,
    card: PropTypes.object.isRequired,
    originalCard: PropTypes.object,
    isEditing: PropTypes.bool.isRequired,
    tableMetadata: PropTypes.object, // can't be required, sometimes null
    onSetCardAttribute: PropTypes.func.isRequired,
    reloadCardFn: PropTypes.func.isRequired,
    setQueryModeFn: PropTypes.func.isRequired,
    isShowingDataReference: PropTypes.bool.isRequired,
    toggleDataReferenceFn: PropTypes.func.isRequired,
    isNew: PropTypes.bool.isRequired,
    isDirty: PropTypes.bool.isRequired,
  };

  componentWillUnmount() {
    clearTimeout(this.timeout);
  }

  resetStateOnTimeout() {
    // clear any previously set timeouts then start a new one
    clearTimeout(this.timeout);
    this.timeout = setTimeout(
      () => this.setState({ recentlySaved: null }),
      5000,
    );
  }

  onCreate = async (card, showSavedModal = true) => {
    const { question, apiCreateQuestion } = this.props;
    const questionWithUpdatedCard = question.setCard(card);
    await apiCreateQuestion(questionWithUpdatedCard);

    this.setState(
      {
        recentlySaved: "created",
        ...(showSavedModal ? { modal: "saved" } : {}),
      },
      this.resetStateOnTimeout,
    );
  };

  onSave = async (card, showSavedModal = true) => {
    const { question, apiUpdateQuestion } = this.props;
    const questionWithUpdatedCard = question.setCard(card);
    await apiUpdateQuestion(questionWithUpdatedCard);

    if (this.props.fromUrl) {
      this.onGoBack();
      return;
    }

    this.setState(
      {
        recentlySaved: "updated",
        ...(showSavedModal ? { modal: "saved" } : {}),
      },
      this.resetStateOnTimeout,
    );
  };

  onBeginEditing() {
    this.props.onBeginEditing();
  }

  async onCancel() {
    if (this.props.fromUrl) {
      this.onGoBack();
    } else {
      this.props.onCancelEditing();
    }
  }

  async onDelete() {
    // TODO: reduxify
    await CardApi.delete({ cardId: this.props.card.id });
    this.onGoBack();
    MetabaseAnalytics.trackEvent("QueryBuilder", "Delete");
  }

  onFollowBreadcrumb() {
    this.props.onRestoreOriginalQuery();
  }

  onToggleDataReference() {
    this.props.toggleDataReferenceFn();
  }

  onGoBack() {
    this.props.onChangeLocation(this.props.fromUrl || "/");
  }


  getHeaderButtons() {
    const {
      question,
      questionAlerts,
      visualizationSettings,
      card,
      isNew,
      isDirty,
      isEditing,
      tableMetadata,
      databases,
    } = this.props;
    const database = _.findWhere(databases, {
      id: card && card.dataset_query && card.dataset_query.database,
    });

    let buttons = [];

    // A card that is either completely new or it has been derived from a saved question
    if (isNew && isDirty) {
      buttons.push([
        <ModalWithTrigger
          form
          key="save"
          ref="saveModal"
          triggerElement={t`Save`}
        >
          <SaveQuestionModal
            card={this.props.card}
            originalCard={this.props.originalCard}
            tableMetadata={this.props.tableMetadata}
            // if saving modified question, don't show "add to dashboard" modal
            saveFn={card => this.onSave(card, false)}
            createFn={this.onCreate}
            onClose={() => this.refs.saveModal && this.refs.saveModal.toggle()}
          />
        </ModalWithTrigger>,
      ]);
    }

    // persistence buttons on saved cards
    if (!isNew && card.can_write) {
      if (!isEditing) {
        if (this.state.recentlySaved) {
          // existing card + not editing + recently saved = save confirmation
          buttons.push([
            <button
              key="recentlySaved"
              className="cursor-pointer bg-white text-success text-bold text-uppercase"
            >
              <span>
                <Icon name="check" size={12} />
                <span className="ml1">{t`Saved`}</span>
              </span>
            </button>,
          ]);
        }
      }
    }

    // parameters
    if (
      question.query() instanceof NativeQuery &&
      database &&
      _.contains(database.features, "native-parameters")
    ) {
      const parametersButtonClasses = cx("transition-color", {
        "text-brand": this.props.uiControls.isShowingTemplateTagsEditor,
        "text-brand-hover": !this.props.uiControls.isShowingTemplateTagsEditor,
      });
      buttons.push([
        <Tooltip key="parameterEdititor" tooltip={t`Variables`}>
          <a className={parametersButtonClasses}>
            <Icon
              name="variable"
              size={16}
              onClick={this.props.toggleTemplateTagsEditor}
            />
          </a>
        </Tooltip>,
      ]);
    }

    const editItem = {
      title: t`Edit question`,
      icon: `document`,
      action: this.onBeginEditing
    }

    const historyItem = {
      title: t`View history`,
      icon: `history`,
      link: `/question/${card.id}/history`
    }

    const moveItem = {
      title: t`Move question`,
      icon: `move`,
      link: `/question/${card.id}/move`
    }

    buttons.push([
      <EntityMenu
        triggerIcon="pencil"
        items={[
          editItem,
          historyItem,
          moveItem
        ]}
      />
    ])

    buttons.push([
      <EntityMenu
        triggerIcon="share"
        items={[
          {
            title: t`Add to dashboard`,
            icon: `addtodash`,
            action: () => this.setState({ modal: "add-to-dashboard" })
          },
          {
            title: t`Download`,
            icon: `download`,
            link: `question/${card.id}/download`
          },
        ]}
      />
    ])

    // add to dashboard
    if (!isNew && !isEditing) {
    } else if (isNew && isDirty) {
      // this is a new card, so we need the user to save first then they can add to dash
      buttons.push([
        <Tooltip key="addtodashsave" tooltip={t`Add to dashboard`}>
          <ModalWithTrigger
            ref="addToDashSaveModal"
            triggerClasses="h4 text-brand-hover text-uppercase"
            triggerElement={
              <span
                data-metabase-event={"QueryBuilder;AddToDash Modal;pre-save"}
                className="text-brand-hover"
              >
                <Icon name="addtodash" size={ICON_SIZE} />
              </span>
            }
          >
            <SaveQuestionModal
              card={this.props.card}
              originalCard={this.props.originalCard}
              tableMetadata={this.props.tableMetadata}
              saveFn={async card => {
                await this.onSave(card, false);
                this.setState({ modal: "add-to-dashboard" });
              }}
              createFn={async card => {
                await this.onCreate(card, false);
                this.setState({ modal: "add-to-dashboard" });
              }}
              onClose={() => this.refs.addToDashSaveModal.toggle()}
              multiStep
            />
          </ModalWithTrigger>
        </Tooltip>,
      ]);
    }

    if (
      !isEditing &&
      card &&
      question.alertType(visualizationSettings) !== null
    ) {
      const createAlertItem = {
        title: t`Get alerts about this`,
        icon: "alert",
        action: () => this.setState({ modal: "create-alert" }),
      };
      const createAlertAfterSavingQuestionItem = {
        title: t`Get alerts about this`,
        icon: "alert",
        action: () => this.setState({ modal: "save-question-before-alert" }),
      };

      const updateAlertItem = {
        title: t`Alerts are on`,
        icon: "alert",
        content: (toggleMenu, setMenuFreeze) => (
          <AlertListPopoverContent
            closeMenu={toggleMenu}
            setMenuFreeze={setMenuFreeze}
          />
        ),
      };

      const viewSqlItem = {
        title: t`View the SQL`,
        icon: `sql`,
        action: () => ({})
      }

      buttons.push([
        <Box mr={1}>
          <EntityMenu
            triggerIcon="burger"
            items={[
              !isNew && Object.values(questionAlerts).length > 0
                ? updateAlertItem
              : isNew ? createAlertAfterSavingQuestionItem : createAlertItem,
              viewSqlItem
            ]}
          />
        </Box>,
      ]);
    }

    return buttons
  }

  onCloseModal = () => {
    this.setState({ modal: null });
  };

  showAlertsAfterQuestionSaved = () => {
    const { questionAlerts, user } = this.props;

    const hasAlertsCreatedByCurrentUser = Object.values(questionAlerts).some(
      alert => alert.creator.id === user.id,
    );

    if (hasAlertsCreatedByCurrentUser) {
      // TODO Atte Keinänen 11/10/17: The question was replaced and there is already an alert created by current user.
      // Should we show pop up the alerts list in this case or do nothing (as we do currently)?
      this.setState({ modal: null });
    } else {
      this.setState({ modal: "create-alert" });
    }
  };

  render() {
    return (
      <Box className="relative">
        <Header
          isEditing={this.props.isEditing}
          objectType="card"
          name={this.props.isNew ? t`New question` : this.props.card.name}
          item={this.props.card}
          description={this.props.card ? this.props.card.description : null}
          breadcrumb={
            !this.props.card.id && this.props.originalCard ? (
              <span className="pl2">
                {t`started from`}{" "}
                <a className="link" onClick={this.onFollowBreadcrumb}>
                  {this.props.originalCard.name}
                </a>
              </span>
            ) : null
          }
          editingTitle={t`You're editing this question`}
          headerButtons={this.getHeaderButtons()}
          editingButtons={[
            <ModalWithTrigger
              triggerElement={
                <Button small>
                  {t`Archive`}
                </Button>
              }
            >
              <ArchiveQuestionModal questionId={this.props.card.id} />,
            </ModalWithTrigger>,
            <ActionButton
              key="save"
              actionFn={() => this.onSave(this.props.card, false)}
              className="cursor-pointer text-brand-hover bg-white text-grey-4 text-uppercase"
              normalText={t`SAVE CHANGES`}
              activeText={t`Saving…`}
              failedText={t`Save failed`}
              successText={t`Saved`}
            />,
            <Button small onClick={() => this.onCancel()}>
              {t`Cancel`}
            </Button>,
          ]}
          setItemAttributeFn={this.props.onSetCardAttribute}
          badge={
            this.props.card.collection && (
              <Link
                to={Urls.collection(this.props.card.collection.id)}
                className="text-uppercase flex align-center no-decoration"
                style={{
                  color: this.props.card.collection.color,
                  fontSize: 12,
                }}
              >
                <Icon
                  name="collection"
                  size={12}
                  style={{ marginRight: "0.5em" }}
                />
                {this.props.card.collection.name}
              </Link>
            )
          }
        />

        <Modal
          small
          isOpen={this.state.modal === "saved"}
          onClose={this.onCloseModal}
        >
          <QuestionSavedModal
            addToDashboardFn={() =>
              this.setState({ modal: "add-to-dashboard" })
            }
            onClose={this.onCloseModal}
          />
        </Modal>

        <Modal
          isOpen={this.state.modal === "add-to-dashboard"}
          onClose={this.onCloseModal}
        >
          <AddToDashSelectDashModal
            card={this.props.card}
            onClose={this.onCloseModal}
            onChangeLocation={this.props.onChangeLocation}
          />
        </Modal>

        <Modal
          full
          isOpen={this.state.modal === "create-alert"}
          onClose={this.onCloseModal}
        >
          <CreateAlertModalContent
            onCancel={this.onCloseModal}
            onAlertCreated={this.onCloseModal}
          />
        </Modal>

        <Modal
          isOpen={this.state.modal === "save-question-before-alert"}
          onClose={this.onCloseModal}
        >
          <SaveQuestionModal
            card={this.props.card}
            originalCard={this.props.originalCard}
            tableMetadata={this.props.tableMetadata}
            saveFn={async card => {
              await this.onSave(card, false);
              this.showAlertsAfterQuestionSaved();
            }}
            createFn={async card => {
              await this.onCreate(card, false);
              this.showAlertsAfterQuestionSaved();
            }}
            // only close the modal if we are closing the dialog without saving
            // otherwise we are in some alerts modal already
            onClose={() =>
              this.state.modal === "save-question-before-alert" &&
              this.setState({ modal: null })
            }
            multiStep
          />
        </Modal>
      </Box>
    );
  }
}
