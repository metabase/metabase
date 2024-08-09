import { useCallback, useMemo, useState } from "react";

import { useListCollectionsQuery } from "metabase/api";
import { SaveQuestionForm } from "metabase/containers/SaveQuestionModal/SaveQuestionForm";
import { SAVE_QUESTION_SCHEMA } from "metabase/containers/SaveQuestionModal/schema";
import type {
  FormValues,
  SaveQuestionModalProps,
} from "metabase/containers/SaveQuestionModal/types";
import {
  getInitialValues,
  getPlaceholder,
  getTitle,
  submitQuestion,
} from "metabase/containers/SaveQuestionModal/util";
import { FormProvider } from "metabase/forms";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_LLM_AUTODESCRIPTION } from "metabase/plugins";
import { getIsSavedQuestionChanged } from "metabase/query_builder/selectors";
import { Flex, Modal } from "metabase/ui";

export const SaveQuestionModal = ({
  question,
  originalQuestion: latestOriginalQuestion,
  onCreate,
  onSave,
  onClose,
  multiStep,
  initialCollectionId,
}: SaveQuestionModalProps) => {
  const { data: collections = [] } = useListCollectionsQuery({});
  const [originalQuestion] = useState(latestOriginalQuestion); // originalQuestion from props changes during saving

  const initialValues: FormValues = useMemo(
    () =>
      getInitialValues(
        collections,
        originalQuestion,
        question,
        initialCollectionId,
      ),
    [collections, initialCollectionId, originalQuestion, question],
  );

  const handleSubmit = useCallback(
    async (details: FormValues) =>
      submitQuestion(originalQuestion, details, question, onSave, onCreate),
    [originalQuestion, question, onSave, onCreate],
  );

  const isSavedQuestionChanged = useSelector(getIsSavedQuestionChanged);
  // we care only about the very first result as question can be changed before
  // the modal is closed
  const [isSavedQuestionInitiallyChanged] = useState(isSavedQuestionChanged);

  const showSaveType =
    isSavedQuestionInitiallyChanged &&
    originalQuestion != null &&
    originalQuestion.canWrite();

  const cardType = question.type();
  const title = getTitle(cardType, showSaveType, multiStep);
  const nameInputPlaceholder = getPlaceholder(cardType);

  return (
    <Modal.Root onClose={onClose} opened={true}>
      <Modal.Overlay />
      <FormProvider
        initialValues={{ ...initialValues }}
        onSubmit={handleSubmit}
        validationSchema={SAVE_QUESTION_SCHEMA}
        enableReinitialize
      >
        {({ values, setValues }) => (
          <Modal.Content p="md" data-testid="save-question-modal">
            <Modal.Header>
              <Modal.Title>{title}</Modal.Title>
              <Flex align="center" justify="flex-end" gap="sm">
                <PLUGIN_LLM_AUTODESCRIPTION.LLMSuggestQuestionInfo
                  question={question}
                  initialCollectionId={initialValues.collection_id}
                  onAccept={nextValues =>
                    setValues({ ...values, ...nextValues })
                  }
                />
                <Modal.CloseButton />
              </Flex>
            </Modal.Header>
            <Modal.Body>
              <SaveQuestionForm
                showSaveType={showSaveType}
                originalQuestion={originalQuestion}
                values={values}
                placeholder={nameInputPlaceholder}
                onClose={onClose}
              />
            </Modal.Body>
          </Modal.Content>
        )}
      </FormProvider>
    </Modal.Root>
  );
};
