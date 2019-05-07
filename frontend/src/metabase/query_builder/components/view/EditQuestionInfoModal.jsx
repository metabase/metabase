import React from "react";

import { t } from "ttag";

import Form from "metabase/containers/Form";
import ModalContent from "metabase/components/ModalContent";

const EditQuestionInfoModal = ({ question, onClose }) => (
  <ModalContent title={t`Edit question`} onClose={onClose}>
    <Form
      form={{
        fields: [{ name: "name" }, { name: "description", type: "text" }],
      }}
      initialValues={question.card()}
      submitTitle={t`Done`}
      onSubmit={card => {
        question
          .setCard({
            ...question.card(),
            ...card,
          })
          .update(null, { doNotClearNameAndId: true });
        onClose();
      }}
    />
  </ModalContent>
);

export default EditQuestionInfoModal;
