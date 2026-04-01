import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Alert, Box, Icon, Stack, Text, TextInput } from "metabase/ui";
import type {
  MetabotLimitPeriod,
  MetabotLimitType,
  MetabotTenantLimit,
  Tenant,
} from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";
import { getLimitPeriodLabel } from "./utils";

type SpecificTenantsTabProps = {
  error: unknown;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  onTenantLimitChange: (tenantId: number, maxUsage: number | null) => void;
  tenantLimits: MetabotTenantLimit[];
  tenants: Tenant[] | undefined;
};

export function TenantLimitsTab({
  error,
  isLoading,
  limitPeriod,
  limitType,
  onTenantLimitChange,
  tenantLimits,
  tenants,
}: SpecificTenantsTabProps) {
  const [search, setSearch] = useState("");
  const [localLimits, setLocalLimits] = useState<Record<number, string>>({});

  const tenantLimitsMap = useMemo(() => {
    const map: Record<number, number | null> = {};
    for (const tl of tenantLimits) {
      map[tl.tenant_id] = tl.max_usage;
    }
    return map;
  }, [tenantLimits]);

  // Sync local state from API data
  useEffect(() => {
    const newLimits: Record<number, string> = {};
    for (const tl of tenantLimits) {
      if (tl.max_usage != null) {
        newLimits[tl.tenant_id] = String(tl.max_usage);
      }
    }
    setLocalLimits(newLimits);
  }, [tenantLimits]);

  const filteredTenants = useMemo(() => {
    if (!tenants) {
      return [];
    }
    const query = search.trim().toLowerCase();
    if (!query) {
      return tenants;
    }
    return tenants.filter((tenant) =>
      tenant.name.toLowerCase().includes(query),
    );
  }, [tenants, search]);

  const handleChange = (tenantId: number, value: string) => {
    setLocalLimits((prev) => ({ ...prev, [tenantId]: value }));
    const maxUsage = value ? Number(value) : null;
    onTenantLimitChange(tenantId, maxUsage);
  };
  const noTenantsToShow = tenants?.length === 0 && !error && !isLoading;
  const { adjective: periodAdjective, i18nContext: periodI18nContext } =
    getLimitPeriodLabel(limitPeriod);

  return (
    <Stack gap="xl">
      <Text c="text-secondary">
        {t`Here you can set total token usage limits for specific tenants. Anything you set here will override the limits set on the instance level.`}
      </Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading tenants` : null}
      >
        {noTenantsToShow ? (
          <Alert mb="md" variant="error" icon={<Icon name="warning" />}>
            {t`No tenants to show`}
          </Alert>
        ) : (
          <Stack gap="xl">
            <TextInput
              placeholder={t`Search...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftSection={<Icon name="search" />}
            />
            {tenants && (
              <Box className={S.TableContainer}>
                <table className={S.Table}>
                  <thead>
                    <tr>
                      <th className={S.HeaderCell}>{t`Tenant`}</th>
                      <th className={S.HeaderCell}>
                        {limitType === "tokens"
                          ? periodI18nContext.adjective
                              .t`Max total ${periodAdjective} token usage (millions)`
                          : periodI18nContext.adjective
                              .t`Max total ${periodAdjective} conversation count`}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className={S.BodyRow}>
                        <td className={S.BodyCell}>{tenant.name}</td>
                        <td className={S.BodyCell}>
                          <TextInput
                            placeholder={t`Unlimited`}
                            value={
                              localLimits[tenant.id] ??
                              (tenantLimitsMap[tenant.id] != null
                                ? String(tenantLimitsMap[tenant.id])
                                : "")
                            }
                            onChange={(e) =>
                              handleChange(tenant.id, e.target.value)
                            }
                            classNames={{ input: S.LimitInput }}
                            type="number"
                            min={1}
                            aria-label={
                              limitType === "tokens"
                                ? periodI18nContext.adjective
                                    .t`Max total ${periodAdjective} tokens for ${tenant.name} (millions)`
                                : c("{0} is the tenant name")
                                    .t`Max total ${periodAdjective} conversations for ${tenant.name}`
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Box>
            )}
          </Stack>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
