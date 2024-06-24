import { useCallback, useMemo } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker/FormCollectionPicker";
import type { FilterItemsInPersonalCollection } from "metabase/common/components/EntityPicker";
import Button from "metabase/core/components/Button";
import FormFooter from "metabase/core/components/FormFooter";
import Dashboards from "metabase/entities/dashboards";
import {
  FormTextInput,
  FormTextarea,
  FormSubmitButton,
  FormErrorMessage,
  FormCheckbox,
  Form,
  FormProvider,
  FormObserver,
} from "metabase/forms";
import * as Errors from "metabase/lib/errors";
import type { CollectionId, Dashboard } from "metabase-types/api";

import { DashboardCopyModalShallowCheckboxLabel } from "../components/DashboardCopyModal/DashboardCopyModalShallowCheckboxLabel/DashboardCopyModalShallowCheckboxLabel";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "../constants";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
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
  onSubmit?: (values: CopyDashboardFormProperties) => Dashboard;
  onSaved?: (dashboard?: Dashboard) => void;
  onClose?: () => void;
  initialValues?: CopyDashboardFormProperties | null;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  onValuesChange?: (vals: CopyDashboardFormProperties) => void;
}

function CopyDashboardForm({
  onSubmit,
  onSaved,
  onClose,
  initialValues,
  filterPersonalCollections,
  onValuesChange,
}: CopyDashboardFormProps) {
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
        />
        <FormCheckbox
          name="is_shallow_copy"
          label={<DashboardCopyModalShallowCheckboxLabel />}
        />
        <FormFooter>
          <FormErrorMessage inline />
          {!!onClose && (
            <Button type="button" onClick={onClose}>{t`Cancel`}</Button>
          )}
          <FormSubmitButton label={t`Duplicate`} />
        </FormFooter>
      </Form>
    </FormProvider>
  );
}

export const CopyDashboardFormConnected =
  _.compose(withRouter)(CopyDashboardForm);
