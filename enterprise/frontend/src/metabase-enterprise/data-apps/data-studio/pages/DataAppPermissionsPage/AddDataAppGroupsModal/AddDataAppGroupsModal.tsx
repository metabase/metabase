import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import { useHasTokenFeature, useMetadataToasts } from "metabase/common/hooks";
import {
  getGroupNameLocalized,
  isAdminGroup,
} from "metabase/common/utils/groups";
import { useSetting } from "metabase/settings";
import { Button, Group, Modal, MultiSelect, Stack, Text } from "metabase/ui";
import {
  useAddDataAppGroupsMutation,
  useGetDataAppGroupsQuery,
} from "metabase-enterprise/api";
import type { DataApp } from "metabase-types/api";

import { trackDataAppGroupAdded } from "../../../analytics";

const DROPDOWN_WIDTH = 300;

type AddDataAppGroupsModalProps = {
  app: DataApp;
  onClose: () => void;
};

export function AddDataAppGroupsModal({
  app,
  onClose,
}: AddDataAppGroupsModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { data: assignedGroups = [] } = useGetDataAppGroupsQuery(app.name);
  const isTenantsEnabled = useSetting("use-tenants");
  const hasTenantsFeature = useHasTokenFeature("tenants");
  const canAssignTenantGroups = isTenantsEnabled && hasTenantsFeature;
  const { data: groups, isLoading } = useListPermissionsGroupsQuery({
    tenancy: canAssignTenantGroups ? "all" : "internal",
  });
  const [addGroups, { isLoading: isAdding }] = useAddDataAppGroupsMutation();
  const { sendErrorToast } = useMetadataToasts();

  const options = useMemo(
    () =>
      groups
        ?.filter(
          (group) =>
            (!group.is_tenant_group || canAssignTenantGroups) &&
            !isAdminGroup(group) &&
            !assignedGroups.some((assigned) => assigned.id === group.id),
        )
        .map((group) => ({
          value: String(group.id),
          label: group.is_tenant_group
            ? t`${getGroupNameLocalized(group)} (tenant group)`
            : getGroupNameLocalized(group),
        })),
    [groups, assignedGroups, canAssignTenantGroups],
  );

  const handleAdd = async () => {
    const { error } = await addGroups({
      name: app.name,
      group_ids: selectedIds.map(Number),
    });
    if (error) {
      sendErrorToast(t`Failed to add groups`);
    } else {
      trackDataAppGroupAdded(app.id);
      onClose();
    }
  };

  return (
    <Modal
      title={t`Add groups to ${app.display_name}`}
      opened
      onClose={onClose}
    >
      <Stack gap="lg" mt="sm">
        <Text>{t`People in these groups will be able to open the app.`}</Text>
        <MultiSelect
          aria-label={t`Groups`}
          placeholder={t`Search for groups to add`}
          searchable
          comboboxProps={{ width: DROPDOWN_WIDTH, position: "bottom-start" }}
          data={options}
          value={selectedIds}
          onChange={setSelectedIds}
          disabled={isLoading}
          data-autofocus
        />
        <Group justify="flex-end" gap="md">
          <Button onClick={onClose}>{t`Cancel`}</Button>
          <Button
            variant="filled"
            loading={isAdding}
            disabled={selectedIds.length === 0}
            onClick={handleAdd}
          >
            {t`Add`}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
