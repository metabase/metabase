import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import { Button } from "metabase/core/components/Button";
import { Form } from "metabase/core/components/Form";
import { FormFooter } from "metabase/core/components/FormFooter";
import { FormProvider } from "metabase/core/components/FormProvider";
import { FormInput } from "metabase/core/components/FormInput";
import { FormTextArea } from "metabase/core/components/FormTextArea";
import { FormSubmitButton } from "metabase/core/components/FormSubmitButton";
import { FormErrorMessage } from "metabase/core/components/FormErrorMessage";

import * as Errors from "metabase/core/utils/errors";

import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";

import type { CollectionId, Dashboard } from "metabase-types/api";
import type { State } from "metabase-types/store";

const DASHBOARD_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  collection_id: Yup.number().nullable(),
});

interface CreateDashboardProperties {
  name: string;
  description: string | null;
  collection_id: CollectionId;
}

export interface CreateDashboardFormOwnProps {
  collectionId?: CollectionId | null; // can be used by `getInitialCollectionId`
  onCreate?: (dashboard: Dashboard) => void;
  onCancel?: () => void;
}

interface CreateDashboardFormStateProps {
  initialCollectionId: CollectionId;
}

interface CreateDashboardFormDispatchProps {
  handleCreateDashboard: (
    dashboard: CreateDashboardProperties,
  ) => Promise<Dashboard>;
}

type Props = CreateDashboardFormOwnProps &
  CreateDashboardFormStateProps &
  CreateDashboardFormDispatchProps;

function mapStateToProps(state: State, props: CreateDashboardFormOwnProps) {
  return {
    initialCollectionId: Collections.selectors.getInitialCollectionId(
      state,
      props,
    ),
  };
}

const mapDispatchToProps = {
  handleCreateDashboard: Dashboards.actions.create,
};

function CreateDashboardForm({
  initialCollectionId,
  handleCreateDashboard,
  onCreate,
  onCancel,
}: Props) {
  const initialValues = useMemo(
    () => ({
      ...DASHBOARD_SCHEMA.getDefault(),
      collection_id: initialCollectionId,
    }),
    [initialCollectionId],
  );

  const handleCreate = useCallback(
    async (values: CreateDashboardProperties) => {
      const action = await handleCreateDashboard(values);
      const dashboard = Dashboards.HACK_getObjectFromAction(action);
      onCreate?.(dashboard);
    },
    [handleCreateDashboard, onCreate],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={DASHBOARD_SCHEMA}
      onSubmit={handleCreate}
    >
      {({ dirty }) => (
        <Form>
          <FormInput
            name="name"
            title={t`Name`}
            placeholder={t`What is the name of your dashboard?`}
            autoFocus
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
          />
          <FormCollectionPicker
            name="collection_id"
            title={t`Which collection should this go in?`}
          />
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton title={t`Create`} disabled={!dirty} primary />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(mapStateToProps, mapDispatchToProps),
)(CreateDashboardForm);
