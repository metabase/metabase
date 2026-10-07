import { useMemo } from "react";
import { t } from "ttag";
import * as Yup from "yup";

import { useCreateCollectionMutation } from "metabase/api";
import { canPlaceEntityInCollection } from "metabase/common/collections/utils";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { Button, Modal } from "metabase/ui";
import * as Errors from "metabase/utils/errors";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerCollectionItem } from "../../types";
import {
  getCollectionType,
  isCollection,
  isInRecentsOrSearch,
} from "../../utils";

const NEW_COLLECTION_SCHEMA = Yup.object({
  name: Yup.string()
    .required(Errors.required)
    .max(100, Errors.maxLength)
    .default(""),
});

export const NewCollectionDialog = () => {
  const [createCollection] = useCreateCollectionMutation();
  const {
    options,
    path,
    setPath,
    isNewCollectionDialogOpen: isOpen,
    openNewCollectionDialog: open,
    closeNewCollectionDialog: close,
  } = useOmniPickerContext();

  const { lastCollection, lastCollectionIdx } = useMemo(() => {
    const lastCollectionIndex = path.findLastIndex(isCollection);

    return {
      lastCollectionIdx: lastCollectionIndex,
      lastCollection:
        path[lastCollectionIndex] && isCollection(path[lastCollectionIndex])
          ? path[lastCollectionIndex]
          : undefined,
    };
  }, [path]);

  if (!options.canCreateCollections) {
    return null;
  }

  const canCreateHere =
    !isInRecentsOrSearch(path) &&
    lastCollection &&
    lastCollection.can_write &&
    canPlaceEntityInCollection(
      "collection",
      getCollectionType(lastCollection),
    ) &&
    PLUGIN_TENANTS.canPlaceEntityInCollection({
      entityType: "collection",
      collection: lastCollection,
    });

  const onCreateNewCollection = async ({ name }: { name: string }) => {
    if (!canCreateHere) {
      return;
    }
    // Virtual collection IDs like "root" and "tenant" should be converted to null
    // These represent namespace roots which have no parent
    const isVirtualRoot =
      lastCollection.id === "root" || lastCollection.id === "tenant";

    const newCollection = await createCollection({
      name,
      parent_id: isVirtualRoot ? null : lastCollection.id,
      namespace: lastCollection.namespace,
    }).unwrap();

    const parentCollection: OmniPickerCollectionItem = {
      ...lastCollection,
      // refresh last collection to show it has new child
      here: lastCollection.here
        ? lastCollection.here.concat(["collection"])
        : ["collection"],
    };

    setPath([
      ...path.slice(0, lastCollectionIdx),
      parentCollection,
      { ...newCollection, can_write: true, model: "collection" }, // select newly created collection
    ]);

    close();
  };

  return (
    <>
      <Button onClick={open} disabled={!canCreateHere}>
        {lastCollection?.namespace === "transforms" ||
        lastCollection?.namespace === "snippets"
          ? t`New folder`
          : t`New collection`}
      </Button>
      <Modal
        title={t`Create a new collection`}
        opened={isOpen}
        onClose={close}
        data-testid="create-collection-on-the-go"
        trapFocus={true}
        withCloseButton={false}
      >
        <FormProvider
          initialValues={{ name: "" }}
          validationSchema={NEW_COLLECTION_SCHEMA}
          onSubmit={onCreateNewCollection}
        >
          {({ dirty }: { dirty: boolean }) => (
            <Form>
              <FormTextInput
                name="name"
                label={t`Give it a name`}
                placeholder={t`My new collection`}
                labelProps={{ my: "0.5rem" }}
                data-autofocus
              />
              <Modal.Footer>
                <FormErrorMessage flex={1} />
                <Button type="button" onClick={close}>{t`Cancel`}</Button>
                <FormSubmitButton
                  type="submit"
                  label={t`Create`}
                  disabled={!dirty}
                  variant="filled"
                />
              </Modal.Footer>
            </Form>
          )}
        </FormProvider>
      </Modal>
    </>
  );
};
