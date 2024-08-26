import { t } from "ttag";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { getPlaceholder } from "metabase/components/SaveQuestionForm/util";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormInput from "metabase/core/components/FormInput";
import FormRadio from "metabase/core/components/FormRadio";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormTextArea from "metabase/core/components/FormTextArea";
import CS from "metabase/css/core/index.css";
import { Form } from "metabase/forms";
import { DEFAULT_MODAL_Z_INDEX } from "metabase/ui";

import { useSaveQuestionContext } from "./context";
import type { SaveQuestionFormProps } from "./types";

export const SaveQuestionForm = ({ onCancel }: SaveQuestionFormProps) => {
  const { question, originalQuestion, showSaveType, values } =
    useSaveQuestionContext();

  const nameInputPlaceholder = getPlaceholder(question.type());

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
          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
            zIndex={DEFAULT_MODAL_Z_INDEX + 1}
          />
        </div>
      )}
      <FormFooter>
        <FormErrorMessage inline />
        <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
        <FormSubmitButton
          title={t`Save`}
          data-testid="save-question-button"
          primary
        />
      </FormFooter>
    </Form>
  );
};
