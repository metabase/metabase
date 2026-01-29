import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { c, t } from "ttag";
import * as Yup from "yup";

import { useGetDashboardQuery } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import { Button } from "metabase/common/components/Button";
import type { FilterItemsInPersonalCollection } from "metabase/common/components/EntityPicker";
import { FormFooter } from "metabase/common/components/FormFooter";
import { Dashboards } from "metabase/entities/dashboards";
import {
  Form,
  FormCheckbox,
  FormErrorMessage,
  FormObserver,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import { Group, Icon, Tooltip } from "metabase/ui";
import type { CollectionId, Dashboard, DashboardId } from "metabase-types/api";

import {
  DASHBOARD_DESCRIPTION_MAX_LENGTH,
  DASHBOARD_NAME_MAX_LENGTH,
} from "../constants";
import { isVirtualDashCard } from "../utils";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(DASHBOARD_NAME_MAX_LENGTH, Errors.maxLength)
    .default(""),
  description: Yup.string()
    .nullable()
    .max(DASHBOARD_DESCRIPTION_MAX_LENGTH, Errors.maxLength)
    .default(null),
  collection_id: Yup.number().nullable().default(null),
  is_shallow_copy: Yup.boolean().default(false),
});

export interface CopyDashboardFormProperties {
  name: string;
  description: string | null;
  collection_id: CollectionId | null;
}

export interface CopyDashboardFormProps {
  onSubmit: (values: CopyDashboardFormProperties) => Promise<Dashboard>;
  onSaved?: (dashboard?: Dashboard) => void;
  onClose?: () => void;
  initialValues?: CopyDashboardFormProperties | null;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  onValuesChange?: (vals: CopyDashboardFormProperties) => void;
  originalDashboardId: DashboardId;
}

function CopyDashboardForm({
  onSubmit,
  onSaved,
  onClose,
  initialValues,
  filterPersonalCollections,
  onValuesChange,
  originalDashboardId,
}: CopyDashboardFormProps) {
  const {
    currentData: originalDashboard,
    isLoading,
    error,
  } = useGetDashboardQuery({ id: originalDashboardId });

  const computedInitialValues = useMemo(
    () => ({
      ...DASHBOARD_SCHEMA.getDefault(),
      ...initialValues,
    }),
    [initialValues],
  );

  const handleSubmit = useCallback(
    async (values: CopyDashboardFormProperties) => {
      const result = await onSubmit?.(values);
      const dashboard = Dashboards.HACK_getObjectFromAction(result);
      onSaved?.(dashboard);
    },
    [onSubmit, onSaved],
  );

  const handleChange = useCallback(
    (values: CopyDashboardFormProperties) => {
      onValuesChange?.(values);
    },
    [onValuesChange],
  );

  const hasDashboardQuestions = useMemo(() => {
    return !!originalDashboard?.dashcards.some(
      (dc) => !isVirtualDashCard(dc) && dc.card.dashboard_id !== null,
    );
  }, [originalDashboard]);

  const hideShallowCopy = Boolean(isLoading || error || hasDashboardQuestions);

  return (
    <FormProvider
      initialValues={computedInitialValues}
      validationSchema={DASHBOARD_SCHEMA}
      onSubmit={handleSubmit}
      enableReinitialize
    >
      <Form>
        <FormObserver onChange={handleChange} />
        <FormTextInput
          name="name"
          label={t`Name`}
          placeholder={t`What is the name of your dashboard?`}
          autoFocus
          mb="1.5rem"
        />
        <FormTextarea
          name="description"
          label={t`Description`}
          placeholder={t`It's optional but oh, so helpful`}
          nullable
          mb="1.5rem"
          minRows={6}
        />
        <FormCollectionPicker
          name="collection_id"
          title={t`Which collection should this go in?`}
          filterPersonalCollections={filterPersonalCollections}
          entityType="dashboard"
        />

        {!hideShallowCopy && (
          <FormCheckbox
            name="is_shallow_copy"
            label={
              <Group align="center" gap="xs">
                {t`Only duplicate the dashboard`}

                <Tooltip
                  label={t`If you check this, the cards in the duplicated dashboard will reference the original questions.`}
                >
                  <Icon name="info" size={18} />
                </Tooltip>
              </Group>
            }
          />
        )}

        <FormFooter>
          <FormErrorMessage inline />
          {!!onClose && (
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton label={c(`A verb, not a noun`).t`Duplicate`} />
        </FormFooter>
      </Form>
    </FormProvider>
  );
}

export const CopyDashboardFormConnected = withRouter(CopyDashboardForm);
