import { c, t } from "ttag";

import type {
  MetabotLimitPeriod,
  MetabotLimitType,
  MetabotTenantLimit,
  Tenant,
} from "metabase-types/api";

export { SAVE_DEBOUNCE_MS, sanitizeUsageLimitValue } from "../../utils";

export type SpecificTenantsTabProps = {
  hasTenantsError: boolean;
  instanceLimit: number | null;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  tenantLimits: MetabotTenantLimit[];
  tenants: Tenant[];
};

export type TenantLimitsMap = Record<number, number | null>;

export function getInputLabel(
  tenantName: string,
  limitType: MetabotLimitType,
  limitPeriod: MetabotLimitPeriod,
): string {
  const inputLabelMap: Record<
    MetabotLimitType,
    Record<MetabotLimitPeriod, string>
  > = {
    tokens: {
      daily: c("{0} is the tenant name")
        .t`Max total daily tokens for ${tenantName} (millions)`,
      weekly: c("{0} is the tenant name")
        .t`Max total weekly tokens for ${tenantName} (millions)`,
      monthly: c("{0} is the tenant name")
        .t`Max total monthly tokens for ${tenantName} (millions)`,
    },
    messages: {
      daily: c("{0} is the tenant name")
        .t`Max total daily messages for ${tenantName}`,
      weekly: c("{0} is the tenant name")
        .t`Max total weekly messages for ${tenantName}`,
      monthly: c("{0} is the tenant name")
        .t`Max total monthly messages for ${tenantName}`,
    },
  };

  return inputLabelMap[limitType][limitPeriod];
}

const columnNameMap: Record<
  MetabotLimitType,
  Record<MetabotLimitPeriod, string>
> = {
  get tokens() {
    return {
      daily: t`Max total daily token usage (millions)`,
      weekly: t`Max total weekly token usage (millions)`,
      monthly: t`Max total monthly token usage (millions)`,
    };
  },
  get messages() {
    return {
      daily: t`Max total daily messages`,
      weekly: t`Max total weekly messages`,
      monthly: t`Max total monthly messages`,
    };
  },
};

export function getColumnName(
  limitType: MetabotLimitType,
  limitPeriod: MetabotLimitPeriod,
) {
  return columnNameMap[limitType][limitPeriod];
}

export function getDescription(limitType: MetabotLimitType) {
  const descriptionMap: Record<MetabotLimitType, string> = {
    tokens: t`Here you can set total token usage limits for specific tenants.`,
    messages: t`Here you can set total message count limits for specific tenants.`,
  };

  return descriptionMap[limitType];
}
