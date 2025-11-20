import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateCollectionMutation,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { CreateCollectionForm } from "metabase/collections/components/CreateCollectionForm";
import type { CreateCollectionProperties } from "metabase/collections/components/CreateCollectionForm/CreateCollectionForm";
import { Tree } from "metabase/common/components/tree";
import { buildCollectionTree } from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import {
  SidebarHeading,
  SidebarSection,
} from "metabase/nav/containers/MainNavbar/MainNavbar.styled";
import { SidebarCollectionLink } from "metabase/nav/containers/MainNavbar/SidebarItems";
import { getSetting } from "metabase/selectors/settings";
import { ActionIcon, Flex, Icon, Modal, Tooltip } from "metabase/ui";

export const MainNavSharedCollections = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const isTenantsEnabled = useSelector((state) =>
    getSetting(state, "use-tenants"),
  );

  const { data: tenantCollections } = useListCollectionsTreeQuery(
    { "include-tenant-collections": true },
    {
      skip: !isTenantsEnabled,
    },
  );

  const [createCollection] = useCreateCollectionMutation();

  const tenantCollectionTree = useMemo(
    () => buildCollectionTree(tenantCollections),
    [tenantCollections],
  );

  const handleCreateTenantCollection = useCallback(
    async (values: CreateCollectionProperties) => {
      await createCollection({
        ...values,
        parent_id: null,
        type: "shared-tenant-collection",
      });
      setModalOpen(false);
    },
    [createCollection],
  );

  if (!isTenantsEnabled) {
    return null;
  }

  return (
    <>
      <SidebarSection>
        <Flex align="center" justify="space-between">
          <SidebarHeading>{t`Tenant collections`}</SidebarHeading>
          <Tooltip label={t`Create a new tenant collection`}>
            <ActionIcon color="text-medium" onClick={() => setModalOpen(true)}>
              <Icon name="add" />
            </ActionIcon>
          </Tooltip>
        </Flex>
        <Tree
          data={tenantCollectionTree}
          TreeNode={SidebarCollectionLink}
          role="tree"
          aria-label="tenant-collection-tree"
        />
      </SidebarSection>
      <Modal
        opened={modalOpen}
        title={t`New shared tenant collection`}
        onClose={() => setModalOpen(false)}
      >
        <CreateCollectionForm
          showCollectionPicker={false}
          onSubmit={handleCreateTenantCollection}
        />
      </Modal>
    </>
  );
};
