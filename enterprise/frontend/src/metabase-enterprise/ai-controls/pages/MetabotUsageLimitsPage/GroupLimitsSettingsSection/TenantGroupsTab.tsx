import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
} from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";

type TenantGroupsTabProps = {
  tenantGroups: GroupInfo[] | undefined;
  isLoading: boolean;
  error: unknown;
  limitPeriod: MetabotLimitPeriod;
  groupLimits: MetabotGroupLimit[];
  instanceLimit: number | null;
  onGroupLimitChange: (groupId: number, maxUsage: number | null) => void;
};

export function TenantGroupsTab({
  tenantGroups,
  isLoading,
  error,
  limitPeriod,
  groupLimits,
  instanceLimit,
  onGroupLimitChange,
}: TenantGroupsTabProps) {
  const [localLimits, setLocalLimits] = useState<Record<number, string>>({});

  const groupLimitsMap = useMemo(() => {
    const map: Record<number, number> = {};
    for (const gl of groupLimits) {
      map[gl.group_id] = gl.max_usage;
    }
    return map;
  }, [groupLimits]);

  // Sync local state from API data
  useEffect(() => {
    const newLimits: Record<number, string> = {};
    for (const gl of groupLimits) {
      newLimits[gl.group_id] = String(gl.max_usage);
    }
    setLocalLimits(newLimits);
  }, [groupLimits]);

  const periodLabel = getPeriodLabel(limitPeriod);

  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  const handleChange = (groupId: number, value: string) => {
    setLocalLimits((prev) => ({ ...prev, [groupId]: value }));
    const maxUsage = value ? Number(value) : null;
    onGroupLimitChange(groupId, maxUsage);
  };

  return (
    <Stack gap="xl">
      <Text c="text-secondary">
        {t`Monthly limits for each individual user in each tenant group.`}
      </Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading tenant groups` : null}
      >
        {tenantGroups && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{t`Tenant group`}</th>
                  <th className={S.HeaderCell}>
                    {c(
                      "{0} indicates the limit reset period, e.g., daily, weekly, monthly",
                    ).t`Max tokens per user each ${periodLabel}`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenantGroups.map((group) => (
                  <tr key={group.id} className={S.BodyRow}>
                    <td className={S.BodyCell}>{group.name}</td>
                    <td className={S.BodyCell}>
                      <TextInput
                        placeholder={placeholder}
                        value={
                          localLimits[group.id] ??
                          (groupLimitsMap[group.id] != null
                            ? String(groupLimitsMap[group.id])
                            : "")
                        }
                        onChange={(e) => handleChange(group.id, e.target.value)}
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={t`Max tokens per user for ${group.name}`}
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

function getPeriodLabel(limitPeriod: MetabotLimitPeriod): string {
  switch (limitPeriod) {
    case "daily":
      return t`day`;
    case "weekly":
      return t`week`;
    case "monthly":
    default:
      return t`month`;
  }
}
