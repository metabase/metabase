import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEmpty } from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, NumberInput, Stack, Text } from "metabase/ui";
import { isDefaultGroup } from "metabase/utils/groups";
import { useUpdateAIControlsGroupLimitMutation } from "metabase-enterprise/api";
import type { GroupInfo } from "metabase-types/api";

import { AllUsersHigherAccessTooltipIcon } from "./AllUsersHigherAccessTooltipIcon";
import S from "./GroupLimitsTab.module.css";
import {
  type GroupLimitsMap,
  type GroupLimitsTabProps,
  SAVE_DEBOUNCE_MS,
  getColumnName,
  getDescription,
  getErrorMessage,
  getGroupLimitAriaLabel,
  getMaxUsageInputSuffix,
  sanitizeUsageLimitValue,
} from "./utils";

export function GroupLimitsTab(props: GroupLimitsTabProps) {
  const {
    variant,
    groups,
    isLoading,
    hasGroupsError,
    limitPeriod,
    limitType,
    groupLimits,
    instanceLimit,
    allUsersGroup,
    allUsersGroupLimit,
  } = props;

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

  /**
   * The "all users" group overrides this group's limit when:
   * - it exists and this group is not itself the "all users" group
   * - the "all users" limit is null (unlimited) OR higher than the group's own limit
   */
  const isAllUsersGroupOverridingLimit = (group: GroupInfo): boolean => {
    if (
      !allUsersGroup ||
      isDefaultGroup(group) ||
      group.magic_group_type === "all-external-users" ||
      allUsersGroupLimit === undefined
    ) {
      return false;
    }
    const thisGroupLimit = localLimitsMap?.[group.id] ?? null;

    if (thisGroupLimit === null) {
      // this group is set to unlimited
      return false;
    }

    return allUsersGroupLimit === null || allUsersGroupLimit > thisGroupLimit;
  };

  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  const handleChange = (group: GroupInfo, inputValue: string | number) => {
    const maxUsage = sanitizeUsageLimitValue(inputValue);
    setLocalLimitsMap((prev) => ({ ...prev, [group.id]: maxUsage }));

    const isOverInstanceLimit =
      maxUsage != null && instanceLimit != null && maxUsage > instanceLimit;

    if (!isOverInstanceLimit) {
      debouncedSaveGroupLimit(group, maxUsage);
    }
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
                {groups.map((group) => {
                  const inputValue = String(localLimitsMap?.[group.id] ?? "");
                  const maxUsage = sanitizeUsageLimitValue(inputValue);
                  const isOverInstanceLimit =
                    maxUsage != null &&
                    instanceLimit != null &&
                    maxUsage > instanceLimit;
                  const showAllUsersOverrideTooltip =
                    isAllUsersGroupOverridingLimit(group) &&
                    !!allUsersGroup &&
                    !isOverInstanceLimit;

                  return (
                    <tr key={group.id} className={S.BodyRow}>
                      <td className={S.BodyCell}>{group.name}</td>
                      <td className={S.BodyCell}>
                        <div className={S.InputWrapper}>
                          <NumberInput
                            placeholder={placeholder}
                            value={inputValue}
                            onChange={(value) => handleChange(group, value)}
                            classNames={{ input: S.LimitInput }}
                            suffix={getMaxUsageInputSuffix(
                              limitType,
                              localLimitsMap?.[group.id],
                            )}
                            min={0}
                            decimalScale={0}
                            aria-label={getGroupLimitAriaLabel(
                              limitType,
                              group.name,
                            )}
                            error={
                              isOverInstanceLimit
                                ? t`Can't be higher than the instance limit`
                                : undefined
                            }
                            rightSection={
                              showAllUsersOverrideTooltip ? (
                                <AllUsersHigherAccessTooltipIcon
                                  groupName={allUsersGroup.name}
                                />
                              ) : undefined
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Box>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
