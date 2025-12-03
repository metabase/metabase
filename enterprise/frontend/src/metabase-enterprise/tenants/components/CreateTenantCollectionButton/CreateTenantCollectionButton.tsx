import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useCreateCollectionMutation } from "metabase/api";
import { CreateCollectionForm } from "metabase/collections/components/CreateCollectionForm";
import type { CreateCollectionProperties } from "metabase/collections/components/CreateCollectionForm/CreateCollectionForm";
import { useDispatch } from "metabase/lib/redux";
import { ActionIcon, Icon, Modal, Tooltip } from "metabase/ui";
import { Urls } from "metabase-enterprise/urls";

export const CreateTenantCollectionButton = () => {
  const [isModalOpen, modal] = useDisclosure(false);
  const [createCollection] = useCreateCollectionMutation();
  const dispatch = useDispatch();

  const handleCreateTenantCollection = useCallback(
    async (values: CreateCollectionProperties) => {
      const result = await createCollection({
        ...values,
        parent_id: null,
        namespace: "shared-tenant-collection",
      });

      dispatch(push(Urls.collection(result.data)));
    },
    [createCollection, dispatch],
  );

  return (
    <>
      <Tooltip label={t`Create tenant collection`}>
        <ActionIcon
          size="lg"
          onClick={modal.open}
          variant="outline"
          c="text-primary"
          bd="1px solid var(--mb-color-border)"
        >
          <Icon name="add_collection" />
        </ActionIcon>
      </Tooltip>

      <Modal
        opened={isModalOpen}
        title={t`New shared tenant collection`}
        onClose={modal.close}
      >
        <CreateCollectionForm
          showCollectionPicker={false}
          onSubmit={handleCreateTenantCollection}
        />
      </Modal>
    </>
  );
};
