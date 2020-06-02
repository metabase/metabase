import React from "react";

import { t } from "ttag";
import _ from "underscore";

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

export default class QueryModals extends React.Component {
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
      setTimeout(() => onOpenModal("create-alert"));
    }
  };

  render() {
    const { modal, question, onCloseModal, onOpenModal } = this.props;
    return modal === "save" ? (
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
            onOpenModal("saved");
          }}
          onClose={onCloseModal}
        />
      </Modal>
    ) : modal === "saved" ? (
      <Modal small onClose={onCloseModal}>
        <QuestionSavedModal
          onClose={onCloseModal}
          addToDashboardFn={() => {
            onOpenModal("add-to-dashboard");
          }}
        />
      </Modal>
    ) : modal === "add-to-dashboard-save" ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          initialCollectionId={this.props.initialCollectionId}
          onSave={async card => {
            await this.props.onSave(card);
            onOpenModal("add-to-dashboard");
          }}
          onCreate={async card => {
            await this.props.onCreate(card);
            onOpenModal("add-to-dashboard");
          }}
          onClose={onCloseModal}
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
    ) : modal === "save-question-before-embed" ? (
      <Modal onClose={onCloseModal}>
        <SaveQuestionModal
          card={this.props.card}
          originalCard={this.props.originalCard}
          tableMetadata={this.props.tableMetadata}
          onSave={async card => {
            await this.props.onSave(card, false);
            onOpenModal("embed");
          }}
          onCreate={async card => {
            await this.props.onCreate(card, false);
            onOpenModal("embed");
          }}
          onClose={onCloseModal}
          multiStep
          initialCollectionId={this.props.initialCollectionId}
        />
      </Modal>
    ) : modal === "history" ? (
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
            const card = question
              .setCollectionId(collection && collection.id)
              .card();

            this.props.onSave(card);
            onCloseModal();
          }}
        />
      </Modal>
    ) : modal === "archive" ? (
      <Modal onClose={onCloseModal}>
        <ArchiveQuestionModal onClose={onCloseModal} />
      </Modal>
    ) : modal === "edit" ? (
      <Modal onClose={onCloseModal}>
        <EditQuestionInfoModal
          question={question}
          onClose={onCloseModal}
          onSave={card => this.props.onSave(card, false)}
        />
      </Modal>
    ) : modal === "embed" ? (
      <Modal full onClose={onCloseModal}>
        <QuestionEmbedWidget card={this.props.card} onClose={onCloseModal} />
      </Modal>
    ) : null;
  }
}
