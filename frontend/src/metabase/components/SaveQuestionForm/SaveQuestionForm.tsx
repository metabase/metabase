import cx from "classnames";
import { t } from "ttag";

import { FormCollectionAndDashboardPicker } from "metabase/collections/containers/FormCollectionAndDashboardPicker";
import type { CollectionPickerModel } from "metabase/common/components/CollectionPicker";
import { getPlaceholder } from "metabase/components/SaveQuestionForm/util";
import { FormFooter } from "metabase/core/components/FormFooter";
import { FormDashboardTabSelect } from "metabase/dashboard/components/FormDashboardTabSelect";
import {
  Form,
  FormErrorMessage,
  FormRadioGroup,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Radio, Stack, rem } from "metabase/ui";

import S from "./SaveQuestionForm.module.css";
import { useSaveQuestionContext } from "./context";

const labelStyles = {
  fontWeight: 900,
  fontSize: "0.77rem",
  color: "var(--mb-color-text-medium)",
  marginBottom: rem("7px"),
};

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
    targetCollection,
    saveToDashboard,
  } = useSaveQuestionContext();

  const nameInputPlaceholder = getPlaceholder(question.type());
  const isDashboardQuestion = !!question.dashboardId();

  const title = isDashboardQuestion
    ? t`Save changes or save as new?`
    : t`Replace or save as new?`;
  const overwriteOptionName = isDashboardQuestion
    ? t`Save changes`
    : t`Replace original question, "${originalQuestion?.displayName()}"`;

  const models: CollectionPickerModel[] =
    question.type() === "question"
      ? ["collection", "dashboard"]
      : ["collection"];

  const showPickerInput =
    values.saveType === "create" && !targetCollection && !saveToDashboard;

  return (
    <Form>
      {showSaveType && (
        <FormRadioGroup
          name="saveType"
          label={title}
          styles={{
            label: {
              fontWeight: 900,
              fontSize: "0.77rem",
              color: "var(--mb-color-text-medium)",
              marginBottom: rem("7px"),
            },
          }}
        >
          <Stack gap="sm" mb="md">
            <Radio
              name={overwriteOptionName}
              value="overwrite"
              label={overwriteOptionName}
              classNames={{
                labelWrapper: S.labelWrapper,
                label: cx(S.label, {
                  [S.labelActive]: values.saveType === "overwrite",
                }),
              }}
            />
            <Radio
              name={t`Save as new question`}
              value="create"
              classNames={{
                label: cx(S.label, {
                  [S.labelActive]: values.saveType === "create",
                }),
              }}
              label={t`Save as new question`}
            />
          </Stack>
        </FormRadioGroup>
      )}
      {values.saveType === "create" && (
        <Stack gap="md" mb="md">
          <FormTextInput
            name="name"
            label={t`Name`}
            placeholder={nameInputPlaceholder}
            styles={{ label: labelStyles }}
          />

          <FormTextarea
            name="description"
            label={t`Description`}
            minRows={4}
            placeholder={t`It's optional but oh, so helpful`}
            styles={{ label: labelStyles }}
          />

          <div>
            {showPickerInput && (
              <FormCollectionAndDashboardPicker
                collectionIdFieldName="collection_id"
                dashboardIdFieldName="dashboard_id"
                title={t`Where do you want to save this?`}
                collectionPickerModalProps={{
                  models,
                  recentFilter: items =>
                    items.filter(item => {
                      // narrow type and make sure it's a dashboard or
                      // collection that the user can write to
                      return item.model !== "table" && item.can_write;
                    }),
                }}
              />
            )}

            <FormDashboardTabSelect
              name="dashboard_tab_id"
              label="Which tab should this go on?"
              dashboardId={values.dashboard_id}
              styles={{
                label: {
                  ...labelStyles,
                  marginBottom: rem("3px"),
                },
              }}
            />
          </div>
        </Stack>
      )}
      <FormFooter>
        <FormErrorMessage inline />
        <Button onClick={onCancel}>{t`Cancel`}</Button>
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
