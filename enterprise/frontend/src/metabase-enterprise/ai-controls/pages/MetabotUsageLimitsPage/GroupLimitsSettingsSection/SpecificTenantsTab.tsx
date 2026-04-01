import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Icon, Stack, Text, TextInput } from "metabase/ui";
import type { MetabotTenantLimit, Tenant } from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";

type SpecificTenantsTabProps = {
  tenants: Tenant[] | undefined;
  isLoading: boolean;
  error: unknown;
  tenantLimits: MetabotTenantLimit[];
  onTenantLimitChange: (tenantId: number, maxUsage: number | null) => void;
};

export function SpecificTenantsTab({
  tenants,
  isLoading,
  error,
  tenantLimits,
  onTenantLimitChange,
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

  return (
    <Stack gap="xl">
      <Text c="text-secondary">
        {t`Here you can set total token usage limits for specific tenants. Anything you set here will override any limits set on the tenant group a tenant belongs to.`}
      </Text>
      <TextInput
        placeholder={t`Search...`}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftSection={<Icon name="search" />}
      />
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading tenants` : null}
      >
        {tenants && (
          <Box className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{t`Tenant`}</th>
                  <th className={S.HeaderCell}>
                    {t`Max total monthly token usage`}
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
                        aria-label={t`Max total monthly tokens for ${tenant.name}`}
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
