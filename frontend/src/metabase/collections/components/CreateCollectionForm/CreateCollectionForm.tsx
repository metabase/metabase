import { useCallback, useMemo, useState } from "react";
import type { WithRouterProps } from "react-router";
import { withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import { skipToken, useGetCollectionQuery } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import { useInitialCollectionId } from "metabase/collections/hooks";
import { Button } from "metabase/common/components/Button";
import { FormErrorMessage } from "metabase/common/components/FormErrorMessage";
import { FormFooter } from "metabase/common/components/FormFooter";
import { FormInput } from "metabase/common/components/FormInput";
import { FormSubmitButton } from "metabase/common/components/FormSubmitButton";
import { FormTextArea } from "metabase/common/components/FormTextArea";
import type {
  EntityPickerOptions,
  FilterItemsInPersonalCollection,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { Collections } from "metabase/entities/collections";
import { Form, FormProvider } from "metabase/forms";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { connect } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Errors from "metabase/utils/errors";
import type { Collection, CollectionNamespace } from "metabase-types/api";

import { FormAuthorityLevelField } from "../../containers/FormAuthorityLevelFieldContainer";

const COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),

  authority_level: Yup.mixed().oneOf(["official", null]).default(null),
  parent_id: Yup.number().nullable(),
});

export interface CreateCollectionProperties {
  name: string;
  description: string | null;
  parent_id: Collection["id"] | null;
  namespace?: CollectionNamespace;
}

export interface CreateCollectionFormOwnProps {
  collectionId?: Collection["id"]; // can be used by `getInitialCollectionId`
  initialCollectionId?: Collection["id"];
  onSubmit: (collection: CreateCollectionProperties) => void;
  onCancel?: () => void;
  filterPersonalCollections?: FilterItemsInPersonalCollection;
  showCollectionPicker?: boolean;
  pickerOptions?: EntityPickerOptions;
  namespaces?: CollectionNamespace[];
  showAuthorityLevelPicker?: boolean;
}

interface CreateCollectionFormDispatchProps {
  handleCreateCollection: (
    collection: CreateCollectionProperties,
  ) => Promise<Collection>;
}

type Props = CreateCollectionFormOwnProps &
  CreateCollectionFormDispatchProps &
  WithRouterProps;

const mapDispatchToProps = {
  handleCreateCollection: Collections.actions.create,
};

function CreateCollectionForm({
  collectionId,
  initialCollectionId: explicitInitialCollectionId,
  location,
  params,
  onSubmit,
  onCancel,
  filterPersonalCollections,
  showCollectionPicker = true,
  pickerOptions,
  namespaces,
  showAuthorityLevelPicker = true,
}: Props) {
  const defaultInitialCollectionId = useInitialCollectionId({
    collectionId,
    location,
    params,
  });
  const initialCollectionId =
    explicitInitialCollectionId ?? defaultInitialCollectionId;
  const initialValues = useMemo(
    () => ({
      ...COLLECTION_SCHEMA.getDefault(),
      parent_id: initialCollectionId,
    }),
    [initialCollectionId],
  );

  const { data: initialCollection } = useGetCollectionQuery(
    initialCollectionId != null ? { id: initialCollectionId } : skipToken,
  );

  const [selectedParentCollection, setSelectedParentCollection] =
    useState<OmniPickerItem | null>(null);

  const handleSubmit = useCallback(
    (values: CreateCollectionProperties) => {
      const parentCollection = selectedParentCollection ?? initialCollection;
      const namespace =
        parentCollection && "namespace" in parentCollection
          ? parentCollection.namespace
          : namespaces?.[0];

      onSubmit({
        ...values,
        namespace: namespace ?? undefined,
      });
    },
    [initialCollection, namespaces, onSubmit, selectedParentCollection],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={COLLECTION_SCHEMA}
      onSubmit={handleSubmit}
    >
      {({ dirty }) => {
        const parentCollection = selectedParentCollection ?? initialCollection;

        // Hide the authority level picker if the parent is a tenant collection.
        const isParentTenantCollection =
          parentCollection && "namespace" in parentCollection
            ? PLUGIN_TENANTS.isTenantCollection(parentCollection)
            : false;

        return (
          <Form>
            <FormInput
              name="name"
              title={t`Name`}
              placeholder={t`My new fantastic collection`}
              data-autofocus
            />
            <FormTextArea
              name="description"
              title={t`Description`}
              placeholder={t`It's optional but oh, so helpful`}
              nullable
              optional
            />
            {showCollectionPicker && (
              <FormCollectionPicker
                collectionPickerModalProps={{
                  options: pickerOptions,
                  namespaces,
                }}
                entityType="collection"
                filterPersonalCollections={filterPersonalCollections}
                mb="1rem"
                name="parent_id"
                onCollectionSelect={setSelectedParentCollection}
                title={t`Collection it's saved in`}
              />
            )}
            {showAuthorityLevelPicker && !isParentTenantCollection && (
              <FormAuthorityLevelField />
            )}
            <FormFooter mt="lg">
              <FormErrorMessage inline />
              <Flex style={{ flexShrink: 1 }} justify="flex-end" gap="sm">
                {!!onCancel && (
                  <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
                )}
                <FormSubmitButton title={t`Create`} disabled={!dirty} primary />
              </Flex>
            </FormFooter>
          </Form>
        );
      }}
    </FormProvider>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  withRouter,
  connect(null, mapDispatchToProps),
)(CreateCollectionForm);
