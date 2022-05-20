/* eslint-disable react/prop-types */
import React from "react";
import { connect } from "react-redux";

import { t } from "ttag";
import _ from "underscore";

import { MODAL_TYPES } from "metabase/query_builder/constants";

import Modal from "metabase/components/Modal";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import AddToDashSelectDashModal from "metabase/containers/AddToDashSelectDashModal";
import EditQuestionInfoModal from "metabase/query_builder/components/view/EditQuestionInfoModal";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import ArchiveQuestionModal from "metabase/query_builder/containers/ArchiveQuestionModal";
import QuestionEmbedWidget from "metabase/query_builder/containers/QuestionEmbedWidget";

import QuestionHistoryModal from "metabase/query_builder/containers/QuestionHistoryModal";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";
import { ImpossibleToCreateModelModal } from "metabase/query_builder/components/ImpossibleToCreateModelModal";
import NewDatasetModal from "metabase/query_builder/components/NewDatasetModal";

import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import WritebackModalForm from "metabase/writeback/containers/WritebackModalForm";
import BulkFilterModal from "metabase/query_builder/components/filters/modals/BulkFilterModal";
import NewEventModal from "metabase/timelines/questions/containers/NewEventModal";
import EditEventModal from "metabase/timelines/questions/containers/EditEventModal";
import MoveEventModal from "metabase/timelines/questions/containers/MoveEventModal";

import { createRowFromTableView } from "metabase/writeback/actions";

class QueryModals extends React.Component {
  showAlertsAfterQuestionSaved = () => {
    const { questionAlerts, user, onCloseModal, onOpenModal } = this.props;

    const hasAlertsCreatedByCurrentUser = _.any(
      questionAlerts,
      alert => alert.creator.id === user.id,
    );

    if (hasAlertsCreatedByCurrentUser) {
      // TODO Atte Keinänen 11/10/17: The question was replaced and there is already an alert created by current user.
      // Should we show pop up the alerts list in this case or do nothing (as we do currently)?
      onCloseModal();
    } else {
      // HACK: in a timeout because save modal closes itself
      setTimeout(() => onOpenModal(MODAL_TYPES.CREATE_ALERT));
    }
  };

  render() {
    const {
      modal,
      modalContext,
      question,
      onCloseModal,
      onOpenModal,
      createRowFromTableView,
    } = this.props;

    const onInsert = values => {
      const table = question.table();
      createRowFromTableView({ table, values });
    };

    return modal === MODAL_TYPES.SAVE ? (
      <Modal form onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          initialCollectionId={this.props.initialCollectionId}
          onSave={async card => {
            // if saving modified question, don't show "add to dashboard" modal
            await this.props.onSave(card);
            onCloseModal();
          }}
          onCreate={async card => {
            await this.props.onCreate(card);
            onOpenModal(MODAL_TYPES.SAVED);
          }}
          onClose={onCloseModal}
        />
      </Modal>
    ) : modal === MODAL_TYPES.SAVED ? (
      <Modal small onClose={onCloseModal}>
        <QuestionSavedModal
          onClose={onCloseModal}
          addToDashboardFn={() => {
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
          }}
        />
      </Modal>
    ) : modal === MODAL_TYPES.ADD_TO_DASHBOARD_SAVE ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          initialCollectionId={this.props.initialCollectionId}
          onSave={async card => {
            await this.props.onSave(card);
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
          }}
          onCreate={async card => {
            await this.props.onCreate(card);
            onOpenModal(MODAL_TYPES.ADD_TO_DASHBOARD);
          }}
          onClose={onCloseModal}
          multiStep
        />
      </Modal>
    ) : modal === MODAL_TYPES.ADD_TO_DASHBOARD ? (
      <Modal onClose={onCloseModal}>
        <AddToDashSelectDashModal
          card={this.props.card}
          onClose={onCloseModal}
          onChangeLocation={this.props.onChangeLocation}
        />
      </Modal>
    ) : modal === MODAL_TYPES.CREATE_ALERT ? (
      <Modal full onClose={onCloseModal}>
        <CreateAlertModalContent
          onCancel={onCloseModal}
          onAlertCreated={onCloseModal}
        />
      </Modal>
    ) : modal === MODAL_TYPES.SAVE_QUESTION_BEFORE_ALERT ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          onSave={async card => {
            await this.props.onSave(card, false);
            this.showAlertsAfterQuestionSaved();
          }}
          onCreate={async card => {
            await this.props.onCreate(card, false);
            this.showAlertsAfterQuestionSaved();
          }}
          onClose={onCloseModal}
          multiStep
          initialCollectionId={this.props.initialCollectionId}
        />
      </Modal>
    ) : modal === MODAL_TYPES.SAVE_QUESTION_BEFORE_EMBED ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          onSave={async card => {
            await this.props.onSave(card, false);
            onOpenModal(MODAL_TYPES.EMBED);
          }}
          onCreate={async card => {
            await this.props.onCreate(card, false);
            onOpenModal(MODAL_TYPES.EMBED);
          }}
          onClose={onCloseModal}
          multiStep
          initialCollectionId={this.props.initialCollectionId}
        />
      </Modal>
    ) : modal === MODAL_TYPES.FILTERS ? (
      <Modal onClose={onCloseModal}>
        <BulkFilterModal question={question} onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.HISTORY ? (
      <Modal onClose={onCloseModal}>
        <QuestionHistoryModal
          questionId={this.props.card.id}
          onClose={onCloseModal}
          onReverted={() => {
            this.props.reloadCard();
            onCloseModal();
          }}
        />
      </Modal>
    ) : modal === MODAL_TYPES.MOVE ? (
      <Modal onClose={onCloseModal}>
        <CollectionMoveModal
          title={t`Which collection should this be in?`}
          initialCollectionId={question.collectionId()}
          onClose={onCloseModal}
          onMove={collection => {
            const card = question
              .setCollectionId(collection && collection.id)
              .card();

            this.props.onSave(card);
            onCloseModal();
          }}
        />
      </Modal>
    ) : modal === MODAL_TYPES.ARCHIVE ? (
      <Modal onClose={onCloseModal}>
        <ArchiveQuestionModal question={question} onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.EDIT ? (
      <Modal onClose={onCloseModal}>
        <EditQuestionInfoModal
          question={question}
          onClose={onCloseModal}
          onSave={card => this.props.onSave(card, false)}
        />
      </Modal>
    ) : modal === MODAL_TYPES.EMBED ? (
      <Modal full onClose={onCloseModal}>
        <QuestionEmbedWidget card={this.props.card} onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.CLONE ? (
      <Modal onClose={onCloseModal}>
        <EntityCopyModal
          entityType="questions"
          entityObject={this.props.card}
          copy={async formValues => {
            const object = await this.props.onCreate({
              ...this.props.card,
              ...formValues,
              description: formValues.description || null,
              collection_position: null,
            });
            return { payload: { object } };
          }}
          onClose={onCloseModal}
          onSaved={() => onOpenModal(MODAL_TYPES.SAVED)}
        />
      </Modal>
    ) : modal === MODAL_TYPES.TURN_INTO_DATASET ? (
      <Modal small onClose={onCloseModal}>
        <NewDatasetModal onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.CAN_NOT_CREATE_MODEL ? (
      <Modal onClose={onCloseModal}>
        <ImpossibleToCreateModelModal onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.NEW_EVENT ? (
      <Modal onClose={onCloseModal}>
        <NewEventModal
          cardId={question.id()}
          collectionId={question.collectionId()}
          onClose={onCloseModal}
        />
      </Modal>
    ) : modal === MODAL_TYPES.EDIT_EVENT ? (
      <Modal onClose={onCloseModal}>
        <EditEventModal eventId={modalContext} onClose={onCloseModal} />
      </Modal>
    ) : modal === MODAL_TYPES.MOVE_EVENT ? (
      <Modal onClose={onCloseModal}>
        <MoveEventModal
          eventId={modalContext}
          collectionId={question.collectionId()}
          onClose={onCloseModal}
        />
      </Modal>
    ) : modal === MODAL_TYPES.INSERT_ROW ? (
      <Modal onClose={onCloseModal}>
        <WritebackModalForm
          table={question.table()}
          onSubmit={onInsert}
          onClose={onCloseModal}
        />
      </Modal>
    ) : null;
  }
}

const mapDispatchToProps = dispatch => ({
  createRowFromTableView: payload => dispatch(createRowFromTableView(payload)),
});

export default connect(() => {}, mapDispatchToProps)(QueryModals);
