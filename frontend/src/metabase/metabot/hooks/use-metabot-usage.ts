import { useMemo } from "react";

import { useGetUserMetabotPermissionsQuery } from "metabase/api";
import type { MetabotUsage } from "metabase-types/api";

import { useMetabotEnabledEmbeddingAware } from "./use-metabot-embedding-aware-enabled";

export type UsageScope = {
  usage: number;
  limit: number;
  percent: number;
  isNearLimit: boolean;
  isAtLimit: boolean;
};

export type PoolUsageScope = UsageScope & {
  scope: "tenant" | "instance";
};

export type MetabotUsageResult = {
  user: UsageScope | null;
  pool: PoolUsageScope | null;
  mostConstrained: (UsageScope | PoolUsageScope) | null;
  limitUnit: MetabotUsage["limit_unit"] | null;
  resetRate: MetabotUsage["limit_reset_rate"] | null;
  isLoading: boolean;
};

function computeScope(usage: number, limit: number | null): UsageScope | null {
  if (limit == null) {
    return null;
  }
  const percent =
    limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : 100;
  return {
    usage,
    limit,
    percent,
    isNearLimit: percent >= 80,
    isAtLimit: percent >= 100,
  };
}

export function computeUsageScopes(
  usage: MetabotUsage | null | undefined,
): Omit<MetabotUsageResult, "isLoading"> {
  if (!usage) {
    return {
      user: null,
      pool: null,
      mostConstrained: null,
      limitUnit: null,
      resetRate: null,
    };
  }

  const user = computeScope(usage.user_usage, usage.user_limit);

  let pool: PoolUsageScope | null = null;
  if (usage.tenant_usage != null && usage.tenant_limit != null) {
    const base = computeScope(usage.tenant_usage, usage.tenant_limit);
    if (base) {
      pool = { ...base, scope: "tenant" };
    }
  } else {
    const base = computeScope(usage.instance_usage, usage.instance_limit);
    if (base) {
      pool = { ...base, scope: "instance" };
    }
  }

  let mostConstrained: (UsageScope | PoolUsageScope) | null = null;
  if (user && pool) {
    mostConstrained = user.percent >= pool.percent ? user : pool;
  } else {
    mostConstrained = user ?? pool;
  }

  return {
    user,
    pool,
    mostConstrained,
    limitUnit: usage.limit_unit,
    resetRate: usage.limit_reset_rate,
  };
}

export const useMetabotUsage = (): MetabotUsageResult => {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  const { data, isLoading } = useGetUserMetabotPermissionsQuery(undefined, {
    skip: !isMetabotEnabled,
  });

  const usage = data?.usage;

  return useMemo(
    () => ({
      ...computeUsageScopes(usage),
      isLoading,
    }),
    [usage, isLoading],
  );
};
