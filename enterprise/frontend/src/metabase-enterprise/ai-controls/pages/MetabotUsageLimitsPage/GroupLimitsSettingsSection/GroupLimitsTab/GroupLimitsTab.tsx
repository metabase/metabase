import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import { isEmpty } from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import { isDefaultGroup } from "metabase/utils/groups";
import { AllUsersHigherAccessTooltipIcon } from "metabase-enterprise/ai-controls/components/AllUsersHigherAccessTooltipIcon";
import { useUpdateAIControlsGroupLimitMutation } from "metabase-enterprise/api";
import type { GroupInfo } from "metabase-types/api";

import S from "./GroupLimitsTab.module.css";
import {
  type GroupLimitsMap,
  type GroupLimitsTabProps,
  SAVE_DEBOUNCE_MS,
  getColumnName,
  getDescription,
  getErrorMessage,
  getGroupLimitAriaLabel,
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
                {groups.map((group) => {
                  const showAllUsersOverrideTooltip =
                    isAllUsersGroupOverridingLimit(group) && !!allUsersGroup;

                  return (
                    <tr key={group.id} className={S.BodyRow}>
                      <td className={S.BodyCell}>{group.name}</td>
                      <td className={S.BodyCell}>
                        <div className={S.InputWrapper}>
                          <TextInput
                            placeholder={placeholder}
                            value={localLimitsMap?.[group.id] ?? ""}
                            onChange={(e) =>
                              handleChange(group, e.target.value)
                            }
                            classNames={{ input: S.LimitInput }}
                            type="number"
                            min={1}
                            aria-label={getGroupLimitAriaLabel(
                              limitType,
                              group.name,
                            )}
                          />
                          {showAllUsersOverrideTooltip && (
                            <AllUsersHigherAccessTooltipIcon
                              groupName={allUsersGroup.name}
                              variant="group-limits"
                            />
                          )}
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
