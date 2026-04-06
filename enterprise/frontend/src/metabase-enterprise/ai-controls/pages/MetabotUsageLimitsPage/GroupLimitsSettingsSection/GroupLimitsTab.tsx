import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import { type Dictionary, isEmpty } from "underscore";

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
  MAX_LIMIT_INPUT,
  SAVE_DEBOUNCE_MS,
  getLimitPeriodLabel,
} from "../utils";

import S from "./GroupLimitsSettingsSection.module.css";

type GroupLimitsTabProps = {
  error: unknown;
  groupLimits: MetabotGroupLimit[];
  groups: GroupInfo[] | undefined;
  instanceLimit: number | null;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  variant: "regular-groups" | "tenant-groups";
};

export function GroupLimitsTab({
  variant,
  groups,
  isLoading,
  error,
  limitPeriod,
  limitType,
  groupLimits,
  instanceLimit,
}: GroupLimitsTabProps) {
  const [updateGroupLimit] = useUpdateAIControlsGroupLimitMutation();
  const [localLimitsMap, setLocalLimitsMap] = useState<Dictionary<number>>({});
  const limitsMap = useMemo(
    () =>
      (groupLimits || []).reduce((map, limitObj) => {
        return { ...map, [limitObj.group_id]: limitObj.max_usage };
      }, {} as Dictionary<number>),
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

  const debouncedSaveGroupLimits = useDebouncedCallback(async () => {
    for (const groupId in localLimitsMap) {
      if (limitsMap[groupId] !== localLimitsMap[groupId]) {
        updateGroupLimit({
          groupId: Number(groupId),
          max_usage: localLimitsMap[groupId],
        })
          .unwrap()
          .catch(() => {
            sendErrorToast(t`Failed to update a group limit`);
          });
      }
    }
  }, SAVE_DEBOUNCE_MS);

  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  const handleChange = (groupId: number, value: string) => {
    let sanitizedValue = value;

    if (sanitizedValue !== "") {
      sanitizedValue = Math.min(Number(value), MAX_LIMIT_INPUT).toString();
    }

    setLocalLimitsMap((prev) => ({
      ...prev,
      [groupId]: sanitizedValue ? Number(sanitizedValue) : null,
    }));
    debouncedSaveGroupLimits();
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
        error={error ? errorMessage : null}
      >
        {groups && (
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
                        onChange={(e) => handleChange(group.id, e.target.value)}
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
