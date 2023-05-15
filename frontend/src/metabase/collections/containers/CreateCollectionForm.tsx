import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";
import { connect } from "react-redux";
import { withRouter } from "react-router";

import Button from "metabase/core/components/Button";
import Form from "metabase/core/components/Form";
import FormFooter from "metabase/core/components/FormFooter";
import FormProvider from "metabase/core/components/FormProvider";
import FormInput from "metabase/core/components/FormInput";
import FormTextArea from "metabase/core/components/FormTextArea";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";

import * as Errors from "metabase/core/utils/errors";

import { color } from "metabase/lib/colors";

import Collections, {
  DEFAULT_COLLECTION_COLOR_ALIAS,
} from "metabase/entities/collections";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";

import type { Collection } from "metabase-types/api";
import type { State } from "metabase-types/store";

import FormAuthorityLevelFieldContainer from "./FormAuthorityLevelFieldContainer";

const COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  color: Yup.string()
    .nullable()
    .default(() => color(DEFAULT_COLLECTION_COLOR_ALIAS)),
  authority_level: Yup.mixed().oneOf(["official", null]).default(null),
  parent_id: Yup.number().nullable(),
});

interface CreateCollectionProperties {
  name: string;
  description: string | null;
  color: string | null;
  parent_id: Collection["id"];
}

export interface CreateCollectionFormOwnProps {
  collectionId?: Collection["id"]; // can be used by `getInitialCollectionId`
  onCreate?: (collection: Collection) => void;
  onCancel?: () => void;
}

interface CreateCollectionFormStateProps {
  initialCollectionId: Collection["id"];
}

interface CreateCollectionFormDispatchProps {
  handleCreateCollection: (
    collection: CreateCollectionProperties,
  ) => Promise<Collection>;
}

type Props = CreateCollectionFormOwnProps &
  CreateCollectionFormStateProps &
  CreateCollectionFormDispatchProps;

function mapStateToProps(
  state: State,
  props: CreateCollectionFormOwnProps,
): CreateCollectionFormStateProps {
  return {
    initialCollectionId: Collections.selectors.getInitialCollectionId(
      state,
      props,
    ),
  };
}

const mapDispatchToProps = {
  handleCreateCollection: Collections.actions.create,
};

function CreateCollectionForm({
  initialCollectionId,
  handleCreateCollection,
  onCreate,
  onCancel,
}: Props) {
  const initialValues = useMemo(
    () => ({
      ...COLLECTION_SCHEMA.getDefault(),
      parent_id: initialCollectionId,
    }),
    [initialCollectionId],
  );

  const handleCreate = useCallback(
    async (values: CreateCollectionProperties) => {
      const action = await handleCreateCollection(values);
      const collection = Collections.HACK_getObjectFromAction(action);
      onCreate?.(collection);
    },
    [handleCreateCollection, onCreate],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={COLLECTION_SCHEMA}
      onSubmit={handleCreate}
    >
      {({ dirty, values }) => (
        <Form>
          <FormInput
            name="name"
            title={t`Name`}
            placeholder={t`My new fantastic collection`}
            autoFocus
          />
          <FormTextArea
            name="description"
            title={t`Description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
            optional
          />
          <FormCollectionPicker
            name="parent_id"
            title={t`Collection it's saved in`}
          />
          <FormAuthorityLevelFieldContainer
            collectionParentId={values.parent_id}
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
)(CreateCollectionForm);
