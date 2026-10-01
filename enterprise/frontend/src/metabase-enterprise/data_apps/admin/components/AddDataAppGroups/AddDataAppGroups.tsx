import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import {
  getGroupNameLocalized,
  isAdminGroup,
} from "metabase/common/utils/groups";
import { Alert, Button, Group, MultiSelect, Stack } from "metabase/ui";
import type { DataAppGroup } from "metabase-types/api";

import S from "./AddDataAppGroups.module.css";

type Props = {
  groups: DataAppGroup[];

  onCancel: () => void;
  onAddGroups: (groupIds: number[]) => Promise<boolean>;
};

export const AddDataAppGroups = ({ groups, onAddGroups, onCancel }: Props) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const groupsQuery = useListPermissionsGroupsQuery({ tenancy: "internal" });

  const selectableGroupOptions = useMemo(
    () =>
      groupsQuery.data
        ?.filter(
          (group) =>
            !group.is_tenant_group &&
            !isAdminGroup(group) &&
            !groups.some((assigned) => assigned.id === group.id),
        )
        .map((group) => ({
          value: String(group.id),
          label: getGroupNameLocalized(group),
        })),
    [groupsQuery.data, groups],
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const success = await onAddGroups(selectedIds.map(Number));

      if (success) {
        setSelectedIds([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack gap="md">
      <Group
        className={S.row}
        data-has-current-groups={groups.length > 0}
        mx={groups.length > 0 ? "-1px" : 0}
        mt={groups.length > 0 ? "-1px" : 0}
        p="0.5rem"
        pr="md"
        gap={0}
        align="center"
        wrap="nowrap"
      >
        <MultiSelect
          flex={1}
          miw={0}
          variant="unstyled"
          rightSection={null}
          classNames={{ pill: S.pill }}
          comboboxProps={{
            withinPortal: true,
            keepMounted: false,

            // Leave a gap beyond the surrounding row's padding and border.
            offset: 18,
          }}
          styles={MULTI_SELECT_STYLES}
          aria-label={t`Search for groups to add`}
          placeholder={t`Search for groups to add`}
          searchable
          maxValues={100}
          data={selectableGroupOptions}
          value={selectedIds}
          onChange={setSelectedIds}
          disabled={isSubmitting || groupsQuery.isLoading}
        />

        <Button
          variant="subtle"
          color="neutral"
          mr="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >{t`Cancel`}</Button>

        <Button
          variant={selectedIds.length > 0 ? "filled" : "default"}
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={!selectedIds.length}
        >{t`Add`}</Button>
      </Group>

      {groupsQuery.isError && (
        <Alert color="error">{t`Could not load groups`}</Alert>
      )}
    </Stack>
  );
};

const MULTI_SELECT_STYLES = {
  input: { background: "transparent", fontSize: "var(--mantine-font-size-lg)" },
};
