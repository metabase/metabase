import { useState } from "react";
import { c, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import type { GroupInfo, MetabotLimitPeriod } from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";

type UserGroupsTabProps = {
  groups: GroupInfo[] | undefined;
  isLoading: boolean;
  error: unknown;
  limitPeriod: MetabotLimitPeriod;
};

export function UserGroupsTab({
  groups,
  isLoading,
  error,
  limitPeriod,
}: UserGroupsTabProps) {
  const [limits, setLimits] = useState<Record<number, string>>({});

  const periodLabel = getPeriodLabel(limitPeriod);

  return (
    <Stack gap="xl">
      <Text c="text-secondary">
        {t`Monthly limits for each individual user in each group. If a user belongs to more than one group, they'll be given the highest limit among all the groups they belong to.`}
      </Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading groups` : null}
      >
        {groups && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{t`Group`}</th>
                  <th className={S.HeaderCell}>
                    {c(
                      "{0} indicates the limit reset period, e.g., daily, weekly, monthly",
                    ).t`Max tokens per user each ${periodLabel}`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className={S.BodyRow}>
                    <td className={S.BodyCell}>{group.name}</td>
                    <td className={S.BodyCell}>
                      <TextInput
                        placeholder={t`Unlimited`}
                        value={limits[group.id] ?? ""}
                        onChange={(e) =>
                          setLimits((prev) => ({
                            ...prev,
                            [group.id]: e.target.value,
                          }))
                        }
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
