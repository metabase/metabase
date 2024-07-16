import { useCallback, useMemo } from "react";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import * as Yup from "yup";

import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import type { CollectionPickerItem } from "metabase/common/components/CollectionPicker";
import Button from "metabase/core/components/Button";
import FormErrorMessage from "metabase/core/components/FormErrorMessage";
import FormFooter from "metabase/core/components/FormFooter";
import FormInput from "metabase/core/components/FormInput";
import FormSubmitButton from "metabase/core/components/FormSubmitButton";
import FormTextArea from "metabase/core/components/FormTextArea";
import { DEFAULT_COLLECTION_COLOR_ALIAS } from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";
import { Form, FormProvider } from "metabase/forms";
import { color } from "metabase/lib/colors";
import * as Errors from "metabase/lib/errors";
import type { Collection, CollectionId } from "metabase-types/api";
import type { State } from "metabase-types/store";

const SNIPPET_COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
  description: Yup.string().nullable().max(255, Errors.maxLength).default(null),
  color: Yup.string()
    .nullable()
    .default(() => color(DEFAULT_COLLECTION_COLOR_ALIAS)),
  parent_id: Yup.number().nullable().default(null),
});

type SnippetCollectionFormValues = Pick<
  Collection,
  "name" | "description" | "parent_id"
>;

type UpdateSnippetCollectionFormValues = Partial<SnippetCollectionFormValues> &
  Pick<Collection, "id">;

export interface SnippetCollectionFormOwnProps {
  collection: Partial<Collection>;
  onSave?: (collection: Collection) => void;
  onCancel?: () => void;
}

interface SnippetCollectionLoaderProps {
  snippetCollection?: Collection;
}

interface SnippetCollectionDispatchProps {
  handleCreateSnippetCollection: (
    values: SnippetCollectionFormValues,
  ) => Promise<Collection>;
  handleUpdateSnippetCollection: (
    values: UpdateSnippetCollectionFormValues,
  ) => Promise<Collection>;
}

type Props = SnippetCollectionFormOwnProps &
  SnippetCollectionLoaderProps &
  SnippetCollectionDispatchProps;

const mapDispatchToProps = {
  handleCreateSnippetCollection: SnippetCollections.actions.create,
  handleUpdateSnippetCollection: SnippetCollections.actions.update,
};

function SnippetCollectionForm({
  collection: passedCollection,
  snippetCollection,
  onSave,
  onCancel,
  handleCreateSnippetCollection,
  handleUpdateSnippetCollection,
}: Props) {
  const collection = snippetCollection || passedCollection;
  const isEditing = collection.id != null;

  const initialValues = useMemo(
    () =>
      collection
        ? SNIPPET_COLLECTION_SCHEMA.cast(collection, { stripUnknown: true })
        : SNIPPET_COLLECTION_SCHEMA.getDefault(),
    [collection],
  );

  const handleCreate = useCallback(
    async (values: SnippetCollectionFormValues) => {
      const action = await handleCreateSnippetCollection(values);
      return SnippetCollections.HACK_getObjectFromAction(action);
    },
    [handleCreateSnippetCollection],
  );

  const handleUpdate = useCallback(
    async (values: UpdateSnippetCollectionFormValues) => {
      const action = await handleUpdateSnippetCollection(values);
      return SnippetCollections.HACK_getObjectFromAction(action);
    },
    [handleUpdateSnippetCollection],
  );

  const handleSubmit = useCallback(
    async (values: SnippetCollectionFormValues) => {
      const nextCollection = isEditing
        ? await handleUpdate({ id: collection.id as CollectionId, ...values })
        : await handleCreate(values);
      onSave?.(nextCollection);
    },
    [collection.id, isEditing, handleCreate, handleUpdate, onSave],
  );

  const shouldDisableItem = useCallback(
    (item: CollectionPickerItem) => {
      if (passedCollection.id === undefined) {
        return false;
      } else {
        return (
          item.effective_location
            ?.split("/")
            .includes(String(passedCollection.id)) ||
          passedCollection.id === item.id
        );
      }
    },
    [passedCollection.id],
  );

  return (
    <FormProvider
      initialValues={initialValues}
      validationSchema={SNIPPET_COLLECTION_SCHEMA}
      enableReinitialize
      onSubmit={handleSubmit}
    >
      {({ dirty }) => (
        <Form>
          <FormInput
            name="name"
            title={t`Give your folder a name`}
            placeholder={t`Something short but sweet`}
            autoFocus
          />
          <FormTextArea
            name="description"
            title={t`Add a description`}
            placeholder={t`It's optional but oh, so helpful`}
            nullable
          />
          <FormCollectionPicker
            name="parent_id"
            title={t`Folder this should be in`}
            type="snippet-collections"
            collectionPickerModalProps={{
              shouldDisableItem: shouldDisableItem,
            }}
          />
          <FormFooter>
            <FormErrorMessage inline />
            {!!onCancel && (
              <Button type="button" onClick={onCancel}>{t`Cancel`}</Button>
            )}
            <FormSubmitButton
              title={isEditing ? t`Update` : t`Create`}
              disabled={!dirty}
              primary
            />
          </FormFooter>
        </Form>
      )}
    </FormProvider>
  );
}

function getCollectionId(state: State, props: SnippetCollectionFormOwnProps) {
  return props.collection?.id;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  SnippetCollections.load({ id: getCollectionId }),
  connect(null, mapDispatchToProps),
)(SnippetCollectionForm);
