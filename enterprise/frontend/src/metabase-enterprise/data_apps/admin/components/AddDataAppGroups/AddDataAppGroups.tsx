import { skipToken } from "@reduxjs/toolkit/query";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { useListPermissionsGroupsQuery } from "metabase/api";
import {
  getGroupNameLocalized,
  isAdminGroup,
} from "metabase/common/utils/groups";
import { Alert, Button, Group, Icon, MultiSelect, Stack } from "metabase/ui";
import { useGetDataAppGroupPermissionWarningsQuery } from "metabase-enterprise/api";
import type { DataAppGroup } from "metabase-types/api";

import { DataAppDataAccessWarning } from "../DataAppDataAccessWarning/DataAppDataAccessWarning";

type Props = {
  appName: string;
  groups: DataAppGroup[];
  hasCurrentGroups: boolean;
  onAddGroups: (groupIds: number[]) => Promise<boolean>;
  onCancel: () => void;
};

export const AddDataAppGroups = ({
  appName,
  groups,
  onAddGroups,
  onCancel,
}: Props) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const candidates = useListPermissionsGroupsQuery({ tenancy: "internal" });

  const eligibleGroups = useMemo(
    () =>
      candidates.data?.filter(
        (group) =>
          !isAdminGroup(group) &&
          !group.is_tenant_group &&
          !groups.some((assigned) => assigned.id === group.id),
      ) ?? [],
    [candidates.data, groups],
  );

  const warnings = useGetDataAppGroupPermissionWarningsQuery(
    selectedIds.length
      ? { name: appName, group_ids: selectedIds.map(Number) }
      : skipToken,
  );

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      if (await onAddGroups(selectedIds.map(Number))) {
        setSelectedIds([]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Stack p="md" gap="md">
      <Group align="flex-end" wrap="nowrap">
        <MultiSelect
          flex={1}
          aria-label={t`Search for groups to add`}
          placeholder={t`Search for groups to add`}
          searchable
          maxValues={100}
          data={eligibleGroups.map((group) => ({
            value: String(group.id),
            label: getGroupNameLocalized(group),
          }))}
          value={selectedIds}
          onChange={setSelectedIds}
          disabled={isSubmitting || candidates.isLoading}
        />
        <Button
          variant="subtle"
          onClick={onCancel}
          disabled={isSubmitting}
        >{t`Cancel`}</Button>
        <Button
          onClick={handleSubmit}
          loading={isSubmitting}
          disabled={!selectedIds.length}
        >{t`Add groups`}</Button>
      </Group>
      {candidates.isError && (
        <Alert color="error">{t`Could not load groups`}</Alert>
      )}
      {warnings.isError && (
        <Alert color="warning" icon={<Icon name="warning" />}>
          {t`We couldn't check data access for some groups. You can still update access to this data app.`}
        </Alert>
      )}
      {warnings.currentData?.map((warning) => {
        const group = eligibleGroups.find(
          (group) => group.id === warning.group_id,
        );
        return (
          group && (
            <Group key={group.id}>
              {getGroupNameLocalized(group)}
              <DataAppDataAccessWarning
                warning={warning}
                groupName={getGroupNameLocalized(group)}
              />
            </Group>
          )
        );
      })}
    </Stack>
  );
};
