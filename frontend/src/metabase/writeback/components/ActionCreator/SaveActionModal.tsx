import React from "react";

import _ from "underscore";
import { t } from "ttag";

import Form, { FormField, FormFooter } from "metabase/containers/FormikForm";
import ModalContent from "metabase/components/ModalContent";
import Modal from "metabase/components/Modal";

import { CardApi } from "metabase/services";
import validate from "metabase/lib/validate";

import type Question from "metabase-lib/lib/Question";

interface SaveActionModalProps {
  question: Question;
  onClose: () => void;
}

interface SaveActionFormData {
  name?: string | null;
  description?: string | null;
  collection_id?: number | null;
}

export default function SaveActionModal({
  question,
  onClose,
}: SaveActionModalProps) {
  const initialValues: SaveActionFormData = {
    name: question.displayName(),
    description: question.description(),
    collection_id: question.collectionId(),
  };

  const handleSubmit = async (questionData: SaveActionFormData) => {
    const newQuestion = question
      .setDisplayName(questionData.name)
      .setDescription(questionData.description)
      .setCollectionId(questionData.collection_id);

    const response = await CardApi.create({
      ...newQuestion.card(),
      parameters: newQuestion.parameters(),
      is_write: true,
      display: "table",
      visualization_settings: {},
    });

    if (response) {
      setTimeout(onClose, 1000);
      // redirect somewhere?
    }
  };

  const validateName = (name: string) => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return validate.required()(name);
  };

  const fields = [
    {
      name: "name",
      validate: validateName,
    },
    { name: "description" },
    { name: "collection_id" },
  ].filter(Boolean);

  return (
    <Modal onClose={onClose}>
      <ModalContent
        id="SaveActionModal"
        title={t`Save action`}
        onClose={onClose}
      >
        <Form
          initialValues={initialValues}
          onSubmit={handleSubmit}
          overwriteOnInitialValuesChange
        >
          {({ Form }) => (
            <Form>
              <div>
                <FormField
                  required
                  autoFocus
                  name="name"
                  title={t`Name`}
                  placeholder={t`What is the name of your action?`}
                />
                <FormField
                  name="description"
                  type="text"
                  title={t`Description`}
                  placeholder={t`It's optional but oh, so helpful`}
                />
                <FormField
                  name="collection_id"
                  title={t`Which collection should this go in?`}
                  type="collection" // this should be app
                />
              </div>
              <FormFooter submitTitle={t`Save`} onCancel={onClose} />
            </Form>
          )}
        </Form>
      </ModalContent>
    </Modal>
  );
}
