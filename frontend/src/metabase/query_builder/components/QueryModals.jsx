import React from "react";

import { t } from "c-3po";

import Modal from "metabase/components/Modal";

import SaveQuestionModal from "metabase/containers/SaveQuestionModal";
import QuestionSavedModal from "metabase/components/QuestionSavedModal";
import AddToDashSelectDashModal from "metabase/containers/AddToDashSelectDashModal";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import ArchiveQuestionModal from "metabase/query_builder/containers/ArchiveQuestionModal";

import QuestionHistoryModal from "metabase/query_builder/containers/QuestionHistoryModal";
import { CreateAlertModalContent } from "metabase/query_builder/components/AlertModals";

export default class QueryModals extends React.Component {
  render() {
    const { modal, question, onCloseModal, onOpenModal } = this.props;
    return modal === "save" ? (
      <Modal form onClose={onCloseModal}>
        <SaveQuestionModal
          onClose={onCloseModal}
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          initialCollectionId={this.props.initialCollectionId}
          // if saving modified question, don't show "add to dashboard" modal
          saveFn={card => this.props.onSave(card, false)}
          createFn={this.props.onCreate}
        />
      </Modal>
    ) : modal === "saved" ? (
      <Modal small onClose={onCloseModal}>
        <QuestionSavedModal
          onClose={onCloseModal}
          addToDashboardFn={() => onOpenModal("add-to-dashboard")}
        />
      </Modal>
    ) : modal === "add-to-dashboard-save" ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          onClose={onCloseModal}
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          initialCollectionId={this.props.initialCollectionId}
          saveFn={async card => {
            await this.onSave(card, false);
            onOpenModal("add-to-dashboard");
          }}
          createFn={async card => {
            await this.onCreate(card, false);
            onOpenModal("add-to-dashboard");
          }}
          multiStep
        />
      </Modal>
    ) : modal === "add-to-dashboard" ? (
      <Modal onClose={onCloseModal}>
        <AddToDashSelectDashModal
          card={this.props.card}
          onClose={onCloseModal}
          onChangeLocation={this.props.onChangeLocation}
        />
      </Modal>
    ) : modal === "create-alert" ? (
      <Modal full onClose={onCloseModal}>
        <CreateAlertModalContent
          onCancel={onCloseModal}
          onAlertCreated={onCloseModal}
        />
      </Modal>
    ) : modal === "save-question-before-alert" ? (
      <Modal onClose={onCloseModal}>
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
            modal === "save-question-before-alert" && onCloseModal()
          }
          multiStep
          initialCollectionId={this.props.initialCollectionId}
        />
      </Modal>
    ) : modal == "history" ? (
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
    ) : modal === "move" ? (
      <Modal onClose={onCloseModal}>
        <CollectionMoveModal
          title={t`Which collection should this be in?`}
          initialCollectionId={question.collectionId()}
          onClose={onCloseModal}
          onMove={collection => {
            question.setCollectionId(collection && collection.id).update();
            onCloseModal();
          }}
        />
      </Modal>
    ) : modal === "archive" ? (
      <Modal onClose={onCloseModal}>
        <ArchiveQuestionModal onClose={onCloseModal} />
      </Modal>
    ) : null;
  }
}
