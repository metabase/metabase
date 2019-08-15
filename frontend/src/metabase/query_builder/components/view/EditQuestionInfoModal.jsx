import React from "react";

import { t } from "ttag";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

const EditQuestionInfoModal = ({ question, onClose, onSave }) => (
  <ModalContent title={t`Edit question`} onClose={onClose}>
    <Form
      form={{
        fields: [{ name: "name" }, { name: "description", type: "text" }],
      }}
      initialValues={question.card()}
      submitTitle={t`Save`}
      onClose={onClose}
      onSubmit={async card => {
        await onSave({ ...question.card(), ...card });
        onClose();
      }}
    />
  </ModalContent>
);

export default EditQuestionInfoModal;
