import { useMemo } from "react";

import { ItemList } from "metabase/common/components/EntityPicker/components/ItemList";
import type {
  CollectionItemListProps,
  CollectionPickerItem,
} from "metabase/common/components/Pickers/CollectionPicker/types";
import { useListTenantsQuery } from "metabase-enterprise/api";
import type { Tenant } from "metabase-types/api";

export const TenantSpecificCollectionsItemList = ({
  onClick,
  selectedItem,
  isFolder,
  isCurrentLevel,
  shouldDisableItem,
  shouldShowItem,
}: CollectionItemListProps) => {
  const {
    data: tenantsData,
    error,
    isLoading,
  } = useListTenantsQuery({ status: "active" });

  const tenantCollections = useMemo(
    () => getTenantCollections(tenantsData?.data),
    [tenantsData?.data],
  );

  return (
    <ItemList
      items={tenantCollections}
      error={error}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      isFolder={isFolder}
      isCurrentLevel={isCurrentLevel}
      shouldDisableItem={shouldDisableItem}
      shouldShowItem={shouldShowItem}
    />
  );
};

const getTenantCollections = (
  tenants?: Tenant[],
): CollectionPickerItem[] | null =>
  tenants
    ?.filter((tenant) => tenant.tenant_collection_id != null)
    .map(
      (tenant): CollectionPickerItem => ({
        id: tenant.tenant_collection_id!,
        name: tenant.name,
        here: ["collection"], // tenant collections can contain collections
        model: "collection",
        location: "/",
        can_write: true,
        type: "tenant-specific-root-collection",
        collection_id: "tenant-specific",
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name)) ?? null;
