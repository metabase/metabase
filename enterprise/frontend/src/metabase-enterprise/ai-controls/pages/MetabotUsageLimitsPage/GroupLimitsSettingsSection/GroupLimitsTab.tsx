import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import { isEmpty } from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import { useUpdateAIControlsGroupLimitMutation } from "metabase-enterprise/api";
import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
  MetabotLimitType,
} from "metabase-types/api";

import { SAVE_DEBOUNCE_MS, sanitizeUsageLimitValue } from "../utils";

import S from "./GroupLimitsSettingsSection.module.css";

type GroupLimitsTabProps = {
  groupLimits: MetabotGroupLimit[];
  groups: GroupInfo[];
  hasGroupsError: boolean;
  instanceLimit: number | null;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  variant: "regular-groups" | "tenant-groups";
};

type GroupLimitsMap = Record<number, number | null>;

export function GroupLimitsTab({
  variant,
  groups,
  isLoading,
  hasGroupsError,
  limitPeriod,
  limitType,
  groupLimits,
  instanceLimit,
}: GroupLimitsTabProps) {
  const [updateGroupLimit] = useUpdateAIControlsGroupLimitMutation();
  const [localLimitsMap, setLocalLimitsMap] = useState<GroupLimitsMap>({});
  const limitsMap = useMemo(
    () =>
      groupLimits.reduce(
        (map, limitObj) => ({
          ...map,
          [limitObj.group_id]: limitObj.max_usage,
        }),
        {} as GroupLimitsMap,
      ),
    [groupLimits],
  );
  const { sendErrorToast } = useMetadataToasts();

  // Local state initialization
  useEffect(() => {
    if (!isEmpty(localLimitsMap) || isEmpty(limitsMap)) {
      return;
    }

    setLocalLimitsMap(limitsMap);
  }, [limitsMap, localLimitsMap]);

  const debouncedSaveGroupLimit = useDebouncedCallback(
    async (group: GroupInfo, maxUsage: number | null) => {
      try {
        await updateGroupLimit({
          groupId: group.id,
          max_usage: maxUsage,
        }).unwrap();
      } catch {
        sendErrorToast(
          t`Usage limit could not be updated for ${group.name} group`,
        );
      }
    },
    SAVE_DEBOUNCE_MS,
  );

  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  const handleChange = (group: GroupInfo, inputValue: string) => {
    const maxUsage = sanitizeUsageLimitValue(inputValue);
    setLocalLimitsMap((prev) => ({ ...prev, [group.id]: maxUsage }));
    debouncedSaveGroupLimit(group, maxUsage);
  };

  return (
    <Stack gap="xl" data-testid="group-limits-tab">
      <Text c="text-secondary">{getDescription(variant, limitPeriod)}</Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={getErrorMessage(hasGroupsError, variant)}
      >
        {groups.length > 0 && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>
                    {variant === "tenant-groups" ? t`Tenant group` : t`Group`}
                  </th>
                  <th className={S.HeaderCell}>
                    {getColumnName(limitType, limitPeriod)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className={S.BodyRow}>
                    <td className={S.BodyCell}>{group.name}</td>
                    <td className={S.BodyCell}>
                      <TextInput
                        placeholder={placeholder}
                        value={localLimitsMap?.[group.id] ?? ""}
                        onChange={(e) => handleChange(group, e.target.value)}
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={
                          limitType === "tokens"
                            ? c("{0} is the group name")
                                .t`Max tokens per user for ${group.name} (millions)`
                            : c("{0} is the group name")
                                .t`Max messages per user for ${group.name}`
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}

function getColumnName(
  limitType: MetabotLimitType,
  limitPeriod: MetabotLimitPeriod,
): string {
  const columnNameMap: Record<
    MetabotLimitType,
    Record<MetabotLimitPeriod, string>
  > = {
    tokens: {
      daily: t`Max tokens per user each day (millions)`,
      weekly: t`Max tokens per user each week (millions)`,
      monthly: t`Max tokens per user each month (millions)`,
    },
    messages: {
      daily: t`Max messages per user each day`,
      weekly: t`Max messages per user each week`,
      monthly: t`Max messages per user each month`,
    },
  };

  return columnNameMap[limitType][limitPeriod];
}

function getDescription(
  variant: GroupLimitsTabProps["variant"],
  limitPeriod: MetabotLimitPeriod,
): string {
  const descriptionMap: Record<
    GroupLimitsTabProps["variant"],
    Record<MetabotLimitPeriod, string>
  > = {
    "tenant-groups": {
      daily: t`Daily limits for each individual user in each tenant group.`,
      weekly: t`Weekly limits for each individual user in each tenant group.`,
      monthly: t`Monthly limits for each individual user in each tenant group.`,
    },
    "regular-groups": {
      daily: t`Daily limits for each individual user in each group.`,
      weekly: t`Weekly limits for each individual user in each group.`,
      monthly: t`Monthly limits for each individual user in each group.`,
    },
  };
  const additionalDesc = t`If a user belongs to more than one group, they'll be given the highest limit among all the groups they belong to.`;

  return `${descriptionMap[variant][limitPeriod]} ${additionalDesc}`;
}

function getErrorMessage(
  hasError: boolean,
  variant: GroupLimitsTabProps["variant"],
) {
  if (hasError) {
    return variant === "tenant-groups"
      ? t`Error loading tenant groups`
      : t`Error loading groups`;
  }

  return null;
}
