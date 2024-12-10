import { t } from "ttag";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { getPlaceholder } from "metabase/components/SaveQuestionForm/util";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormInput from "metabase/core/components/FormInput";
import FormRadio from "metabase/core/components/FormRadio";
import FormTextArea from "metabase/core/components/FormTextArea";
import CS from "metabase/css/core/index.css";
import { Form, FormSubmitButton } from "metabase/forms";
import { isNullOrUndefined } from "metabase/lib/types";

import { useSaveQuestionContext } from "./context";

export const SaveQuestionForm = ({
  onCancel,
  onSaveSuccess,
}: {
  onCancel?: () => void;
  onSaveSuccess?: () => void;
}) => {
  const {
    question,
    originalQuestion,
    showSaveType,
    values,
    saveToCollectionId,
  } = useSaveQuestionContext();

  const nameInputPlaceholder = getPlaceholder(question.type());

  const isCollectionPickerEnabled = isNullOrUndefined(saveToCollectionId);

  return (
    <Form>
      {showSaveType && (
        <FormRadio
          name="saveType"
          title={t`Replace or save as new?`}
          options={[
            {
              name: t`Replace original question, "${originalQuestion?.displayName()}"`,
              value: "overwrite",
            },
            { name: t`Save as new question`, value: "create" },
          ]}
          vertical
        />
      )}
      {values.saveType === "create" && (
        <div className={CS.overflowHidden}>
          <FormInput
            name="name"
            title={t`Name`}
            placeholder={nameInputPlaceholder}
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
          />
          {isCollectionPickerEnabled && (
            <FormCollectionPicker
              name="collection_id"
              title={t`Which collection should this go in?`}
            />
          )}
        </div>
      )}
      <FormFooter>
        <FormErrorMessage inline />
        <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
        <FormSubmitButton
          label={t`Save`}
          data-testid="save-question-button"
          variant="filled"
          onSuccess={onSaveSuccess}
        />
      </FormFooter>
    </Form>
  );
};
