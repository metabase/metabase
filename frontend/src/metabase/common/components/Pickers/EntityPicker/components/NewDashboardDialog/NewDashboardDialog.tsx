import { useMemo } from "react";
import { t } from "ttag";

import { useCreateDashboardMutation } from "metabase/api";
import { FormFooter } from "metabase/common/components/FormFooter";
import { useEscapeToCloseModal } from "metabase/common/hooks/use-escape-to-close-modal";
import {
  Form,
  FormErrorMessage,
  FormProvider,
  FormSubmitButton,
  FormTextInput,
} from "metabase/forms";
import { PLUGIN_DATA_STUDIO, PLUGIN_TENANTS } from "metabase/plugins";
import { Button, Flex, Modal } from "metabase/ui";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerCollectionItem } from "../../types";
import {
  getCollectionType,
  isCollection,
  isInRecentsOrSearch,
} from "../../utils";

export const NewDashboardDialog = () => {
  const [createDashboard] = useCreateDashboardMutation();
  const {
    options,
    path,
    setPath,
    isNewDashboardDialogOpen: isOpen,
    openNewDashboardDialog: open,
    closeNewDashboardDialog: close,
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

  useEscapeToCloseModal(close, { capture: true });

  if (!options.canCreateDashboards) {
    return null;
  }

  const canCreateHere =
    !isInRecentsOrSearch(path) &&
    lastCollection &&
    "can_write" in lastCollection &&
    lastCollection.can_write &&
    PLUGIN_TENANTS.canPlaceEntityInCollection({
      entityType: "dashboard",
      collection: lastCollection,
    }) &&
    PLUGIN_DATA_STUDIO.canPlaceEntityInCollection(
      "dashboard",
      getCollectionType(lastCollection),
    );

  const onCreateNewDashboard = async ({ name }: { name: string }) => {
    if (!canCreateHere) {
      return;
    }
    const newDashboard = await createDashboard({
      name,
      collection_id: lastCollection.id === "root" ? null : lastCollection.id,
    }).unwrap();

    const parentCollection: OmniPickerCollectionItem = {
      ...lastCollection,
      // refresh last collection to show it has new child
      here: lastCollection.here
        ? lastCollection.here.concat(["dashboard"])
        : ["dashboard"],
    };

    setPath([
      ...path.slice(0, lastCollectionIdx),
      parentCollection,
      { ...newDashboard, model: "dashboard" }, // select newly created dashboard
    ]);

    close();
  };

  return (
    <>
      <Button onClick={open} disabled={!canCreateHere}>
        {t`New dashboard`}
      </Button>
      <Modal
        title={t`Create a new dashboard`}
        opened={isOpen}
        onClose={close}
        data-testid="create-dashboard-on-the-go"
        trapFocus={true}
        withCloseButton={false}
        closeOnEscape={false}
        styles={{
          content: {
            padding: "1rem",
          },
        }}
      >
        <FormProvider
          initialValues={{ name: "" }}
          onSubmit={onCreateNewDashboard}
        >
          {({ dirty, isSubmitting }) => (
            <Form>
              <FormTextInput
                name="name"
                label={t`Give it a name`}
                placeholder={t`My new dashboard`}
                mb="1rem"
                labelProps={{ my: "0.5rem" }}
                data-autofocus
              />
              <FormFooter>
                <FormErrorMessage inline />
                <Flex style={{ flexShrink: 1 }} justify="flex-end" gap="sm">
                  <Button type="button" onClick={close}>{t`Cancel`}</Button>
                  <FormSubmitButton
                    type="submit"
                    label={t`Create`}
                    disabled={!dirty || isSubmitting}
                    variant="filled"
                  />
                </Flex>
              </FormFooter>
            </Form>
          )}
        </FormProvider>
      </Modal>
    </>
  );
};
