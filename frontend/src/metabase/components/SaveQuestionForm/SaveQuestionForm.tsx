import { t } from "ttag";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { getPlaceholder } from "metabase/components/SaveQuestionForm/util";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import CS from "metabase/css/core/index.css";
import {
  Form,
  FormRadioGroup,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { DEFAULT_MODAL_Z_INDEX, Radio, Stack } from "metabase/ui";

import { useSaveQuestionContext } from "./context";
import type { SaveQuestionFormProps } from "./types";

export const SaveQuestionForm = ({ onCancel }: SaveQuestionFormProps) => {
  const { question, originalQuestion, showSaveType, values } =
    useSaveQuestionContext();

  const nameInputPlaceholder = getPlaceholder(question.type());

  return (
    <Form>
      {showSaveType && (
        <FormRadioGroup
          name="saveType"
          label={t`Replace or save as new?`}
          mb="md"
        >
          <Radio
            value={"overwrite"}
            label={t`Replace original question, "${originalQuestion?.displayName()}"`}
          />
          <Radio value={"create"} label={t`Save as new question`} />
        </FormRadioGroup>
      )}

      {values.saveType === "create" && (
        <Stack className={CS.overflowHidden}>
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={nameInputPlaceholder}
          />

          <FormTextarea
            name="description"
            label={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
          />

          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
            zIndex={DEFAULT_MODAL_Z_INDEX + 1}
          />
        </Stack>
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
