import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import { isEmpty } from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { capitalize } from "metabase/lib/formatting/strings";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import { useUpdateAIControlsGroupLimitMutation } from "metabase-enterprise/api";
import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
  MetabotLimitType,
} from "metabase-types/api";

import {
  SAVE_DEBOUNCE_MS,
  getLimitPeriodLabel,
  sanitizeUsageLimitValue,
} from "../utils";

import S from "./GroupLimitsSettingsSection.module.css";

type GroupLimitsTabProps = {
  groupLimits: MetabotGroupLimit[];
  groups: GroupInfo[];
  hasGroupsError: unknown;
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

  const {
    periodNoun,
    periodI18nContext,
    columnHeader,
    description,
    errorMessage,
  } = getLabels(limitPeriod, variant);

  return (
    <Stack gap="xl" data-testid="group-limits-tab">
      <Text c="text-secondary">{description}</Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={hasGroupsError ? errorMessage : null}
      >
        {groups.length > 0 && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{columnHeader}</th>
                  <th className={S.HeaderCell}>
                    {limitType === "tokens"
                      ? periodI18nContext.noun
                          .t`Max tokens per user each ${periodNoun} (millions)`
                      : periodI18nContext.noun
                          .t`Max messages per user each ${periodNoun}`}
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
