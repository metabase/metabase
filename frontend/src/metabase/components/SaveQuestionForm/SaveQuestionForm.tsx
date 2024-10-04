import { t } from "ttag";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import { getPlaceholder } from "metabase/components/SaveQuestionForm/util";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormInput from "metabase/core/components/FormInput";
import FormRadio from "metabase/core/components/FormRadio";
import FormSelect from "metabase/core/components/FormSelect";
import FormTextArea from "metabase/core/components/FormTextArea";
import CoreStyles from "metabase/css/core/index.css";
import { Form, FormSubmitButton } from "metabase/forms";
import { DEFAULT_MODAL_Z_INDEX } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import CS from "./SaveQuestionForm.module.css";
import { useSaveQuestionContext } from "./context";

export const SaveQuestionForm = ({
  onCancel,
  onSaveSuccess,
  saveToDashboard,
}: {
  onCancel?: () => void;
  onSaveSuccess?: () => void;
  saveToDashboard?: Dashboard | null | undefined;
}) => {
  const { question, originalQuestion, showSaveType, values } =
    useSaveQuestionContext();

  const nameInputPlaceholder = getPlaceholder(question.type());
  const isDashboardQuestion = !!question.dashboardId();

  const title = isDashboardQuestion
    ? t`Save changes or save as new?`
    : t`Replace or save as new?`;
  const overwriteOptionName = isDashboardQuestion
    ? t`Save changes`
    : t`Replace original question, "${originalQuestion?.displayName()}"`;

  const showPickerInput = values.saveType === "create" && !saveToDashboard;
  const showTabSelect =
    values.saveType === "overwrite" &&
    saveToDashboard &&
    saveToDashboard.tabs &&
    saveToDashboard.tabs.length > 1;

  return (
    <Form>
      {showSaveType && (
        <FormRadio
          name="saveType"
          title={title}
          options={[
            {
              name: overwriteOptionName,
              value: "overwrite",
            },
            { name: t`Save as new question`, value: "create" },
          ]}
          vertical
        />
      )}
      {values.saveType === "create" && (
        <div className={CoreStyles.overflowHidden}>
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
          {showPickerInput && (
            <FormCollectionAndDashboardPicker
              collectionIdFieldName="collection_id"
              dashboardIdFieldName="dashboard_id"
              title={t`Where do you want to save this?`}
              zIndex={DEFAULT_MODAL_Z_INDEX + 1}
            />
          )}
          {showTabSelect && (
            <FormSelect
              name="tab_id"
              title="Which tab should this go on?"
              containerClassName={CS.dashboardTabSelectContainer}
              options={saveToDashboard.tabs?.map(tab => ({
                name: tab.name,
                value: tab.id,
              }))}
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
