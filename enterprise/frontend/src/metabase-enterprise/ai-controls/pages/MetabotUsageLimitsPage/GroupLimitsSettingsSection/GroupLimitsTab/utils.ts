import { c, t } from "ttag";

import type {
  GroupInfo,
  MetabotGroupLimit,
  MetabotLimitPeriod,
  MetabotLimitType,
} from "metabase-types/api";
export { SAVE_DEBOUNCE_MS, sanitizeUsageLimitValue } from "../../utils";

export type GroupLimitsTabProps = {
  groupLimits: MetabotGroupLimit[];
  groups: GroupInfo[];
  hasGroupsError: boolean;
  instanceLimit: number | null;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  variant: "regular-groups" | "tenant-groups";
  allUsersGroup?: GroupInfo;
  allUsersGroupLimit?: number | null;
};

export type GroupLimitsMap = Record<number, number | null>;

export function getGroupLimitAriaLabel(
  limitType: MetabotLimitType,
  groupName: string,
) {
  if (limitType === "tokens") {
    return c("{0} is the group name")
      .t`Max tokens per user for ${groupName} (millions)`;
  }

  return c("{0} is the group name").t`Max messages per user for ${groupName}`;
}

const columnNameMap: Record<
  MetabotLimitType,
  Record<MetabotLimitPeriod, string>
> = {
  get tokens() {
    return {
      daily: t`Max tokens per user each day (millions)`,
      weekly: t`Max tokens per user each week (millions)`,
      monthly: t`Max tokens per user each month (millions)`,
    };
  },
  get messages() {
    return {
      daily: t`Max messages per user each day`,
      weekly: t`Max messages per user each week`,
      monthly: t`Max messages per user each month`,
    };
  },
};

export function getColumnName(
  limitType: MetabotLimitType,
  limitPeriod: MetabotLimitPeriod,
): string {
  return columnNameMap[limitType][limitPeriod];
}

const descriptionMap: Record<
  GroupLimitsTabProps["variant"],
  Record<MetabotLimitPeriod, string>
> = {
  get ["tenant-groups"]() {
    return {
      daily: t`Daily limits for each individual user in each tenant group.`,
      weekly: t`Weekly limits for each individual user in each tenant group.`,
      monthly: t`Monthly limits for each individual user in each tenant group.`,
    };
  },
  get ["regular-groups"]() {
    return {
      daily: t`Daily limits for each individual user in each group.`,
      weekly: t`Weekly limits for each individual user in each group.`,
      monthly: t`Monthly limits for each individual user in each group.`,
    };
  },
};

export function getDescription(
  variant: GroupLimitsTabProps["variant"],
  limitPeriod: MetabotLimitPeriod,
): string {
  const additionalDesc = t`If a user belongs to more than one group, they'll be given the highest limit among all the groups they belong to.`;

  return `${descriptionMap[variant][limitPeriod]} ${additionalDesc}`;
}

export function getErrorMessage(
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
