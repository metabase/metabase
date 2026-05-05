import { type KeyboardEvent, useCallback, useMemo } from "react";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import FormCollectionPicker from "metabase/collections/containers/FormCollectionPicker";
import {
  COLLECTION_FORM_SCHEMA,
  type CollectionFormValues,
} from "metabase/collections/schemas";
import type { EntityType } from "metabase/collections/utils";
import type {
  EntityPickerOptions,
  OmniPickerItem,
} from "metabase/common/components/Pickers";
import { isItemInCollectionOrItsDescendants } from "metabase/common/components/Pickers/utils";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
  FormTextarea,
} from "metabase/forms";
import { Button, Group, Modal, Stack } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  CollectionItem,
} from "metabase-types/api";

type EditCollectionModalProps = {
  collection: Collection | CollectionItem;
  onClose: () => void;
  onSave?: (details: {
    previousParentId: CollectionId | null;
    newParentId: CollectionId | null;
  }) => void;
};

const isCollectionItem = (
  collection: Collection | CollectionItem,
): collection is CollectionItem => {
  return "collection_id" in collection;
};

export function EditCollectionModal(props: EditCollectionModalProps) {
  const { collection, onClose, onSave } = props;
  const [updateCollection] = useUpdateCollectionMutation();
  const initialValues = useMemo<CollectionFormValues>(() => {
    const parentId = isCollectionItem(collection)
      ? collection.collection_id
      : collection.parent_id;
    return {
      name: collection.name ?? "",
      description: collection.description ?? null,
      parent_id: typeof parentId === "number" ? parentId : null,
    };
  }, [collection]);

  const handleSubmit = useCallback(
    async (values: CollectionFormValues) => {
      await updateCollection({
        id: collection.id,
        name: values.name,
        description: values.description ?? undefined,
        parent_id: values.parent_id,
      }).unwrap();
      onSave?.({
        previousParentId: initialValues.parent_id,
        newParentId: values.parent_id,
      });
      onClose();
    },
    [collection.id, initialValues.parent_id, updateCollection, onSave, onClose],
  );

  const shouldDisableItem = useCallback(
    (item: OmniPickerItem) =>
      isItemInCollectionOrItsDescendants(item, collection.id),
    [collection.id],
  );

  const stopPropagation = useCallback(
    (e: KeyboardEvent) => e.stopPropagation(),
    [],
  );

  return (
    <Modal
      title={t`Editing ${collection.name}`}
      opened
      onClose={onClose}
      padding="xl"
      onKeyDown={stopPropagation}
    >
      <FormProvider
        initialValues={initialValues}
        validationSchema={COLLECTION_FORM_SCHEMA}
        onSubmit={handleSubmit}
        enableReinitialize
      >
        {({ dirty }) => (
          <Form>
            <Stack gap="lg" mt="sm">
              <FormTextInput
                name="name"
                label={t`Name`}
                placeholder={t`My collection`}
                data-autofocus
              />
              <FormTextarea
                name="description"
                label={t`Description`}
                placeholder={t`Add a description`}
                nullable
              />
              <FormCollectionPicker
                name="parent_id"
                title={t`Parent collection`}
                entityType={getPickerEntityType(collection.type)}
                collectionPickerModalProps={{
                  options: pickerOptions,
                  isDisabledItem: shouldDisableItem,
                  namespaces: collection.namespace
                    ? [collection.namespace]
                    : [],
                  disableRecentLogging: true,
                }}
              />
              <Group justify="flex-end">
                <FormErrorMessage />
                <Button onClick={onClose}>{t`Cancel`}</Button>
                <FormSubmitButton
                  label={t`Save`}
                  variant="filled"
                  disabled={!dirty}
                />
              </Group>
            </Stack>
          </Form>
        )}
      </FormProvider>
    </Modal>
  );
}

function getPickerEntityType(
  collectionType: Collection["type"] | CollectionItem["type"],
): EntityType | undefined {
  if (collectionType === "library-data") {
    return "table";
  }

  if (collectionType === "library-metrics") {
    return "metric";
  }

  return undefined;
}

const pickerOptions: EntityPickerOptions = {
  hasLibrary: true,
  hasRootCollection: false,
  hasPersonalCollections: false,
  hasRecents: false,
  hasSearch: false,
  hasConfirmButtons: true,
  canCreateCollections: true,
};
