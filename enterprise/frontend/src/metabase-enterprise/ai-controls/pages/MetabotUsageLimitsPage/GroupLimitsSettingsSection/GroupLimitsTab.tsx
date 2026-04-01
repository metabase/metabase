import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { capitalize } from "metabase/lib/formatting/strings";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
} from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";
import { getLimitPeriodLabel } from "./utils";

type GroupLimitsTabProps = {
  variant: "regular-groups" | "tenant-groups";
  groups: GroupInfo[] | undefined;
  isLoading: boolean;
  error: unknown;
  limitPeriod: MetabotLimitPeriod;
  groupLimits: MetabotGroupLimit[];
  instanceLimit: number | null;
  onGroupLimitChange: (groupId: number, maxUsage: number | null) => void;
};

export function GroupLimitsTab({
  variant,
  groups,
  isLoading,
  error,
  limitPeriod,
  groupLimits,
  instanceLimit,
  onGroupLimitChange,
}: GroupLimitsTabProps) {
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

  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  const handleChange = (groupId: number, value: string) => {
    setLocalLimits((prev) => ({ ...prev, [groupId]: value }));
    const maxUsage = value ? Number(value) : null;
    onGroupLimitChange(groupId, maxUsage);
  };

  const {
    periodNoun,
    periodI18nContext,
    columnHeader,
    description,
    errorMessage,
  } = getLabels(limitPeriod, variant);

  return (
    <Stack gap="xl">
      <Text c="text-secondary">{description}</Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? errorMessage : null}
      >
        {groups && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{columnHeader}</th>
                  <th className={S.HeaderCell}>
                    {periodI18nContext.noun
                      .t`Max tokens per user each ${periodNoun}`}
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
                        aria-label={c("{0} is the group name")
                          .t`Max tokens per user for ${group.name}`}
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

function getLabels(
  limitPeriod: MetabotLimitPeriod,
  variant: GroupLimitsTabProps["variant"],
) {
  const {
    noun: periodNoun,
    adjective: periodAdjective,
    i18nContext,
  } = getLimitPeriodLabel(limitPeriod);

  const description =
    variant === "tenant-groups"
      ? i18nContext.adjective
          .t`${capitalize(periodAdjective)} limits for each individual user in each tenant group.`
      : i18nContext.adjective
          .t`${capitalize(periodAdjective)} limits for each individual user in each group. If a user belongs to more than one group, they'll be given the highest limit among all the groups they belong to.`;

  const errorMessage =
    variant === "tenant-groups"
      ? t`Error loading tenant groups`
      : t`Error loading groups`;

  const columnHeader = variant === "tenant-groups" ? t`Tenant group` : t`Group`;

  return {
    columnHeader,
    description,
    errorMessage,
    periodNoun,
    periodI18nContext: i18nContext,
  };
}
