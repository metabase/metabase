import { useMemo, useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Icon, Stack, Text, TextInput } from "metabase/ui";
import type { Tenant } from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";

type TenantLimits = {
  maxTotalMonthlyTokens: string;
  maxTokensPerUser: string;
};

type SpecificTenantsTabProps = {
  tenants: Tenant[] | undefined;
  isLoading: boolean;
  error: unknown;
};

export function SpecificTenantsTab({
  tenants,
  isLoading,
  error,
}: SpecificTenantsTabProps) {
  const [search, setSearch] = useState("");
  const [limits, setLimits] = useState<Record<number, TenantLimits>>({});

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

  const handleLimitChange = (
    tenantId: number,
    field: keyof TenantLimits,
    value: string,
  ) => {
    setLimits((prev) => ({
      ...prev,
      [tenantId]: {
        maxTotalMonthlyTokens: prev[tenantId]?.maxTotalMonthlyTokens ?? "",
        maxTokensPerUser: prev[tenantId]?.maxTokensPerUser ?? "",
        [field]: value,
      },
    }));
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
                  <th className={S.HeaderCell}>{t`Max tokens per user`}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className={S.BodyRow}>
                    <td className={S.BodyCell}>{tenant.name}</td>
                    <td className={S.BodyCell}>
                      {/* TODO: placeholder should match the Per-user {period} token limit set in GeneralLimitsSettingsSection */}
                      <TextInput
                        placeholder={t`Unlimited`}
                        value={limits[tenant.id]?.maxTotalMonthlyTokens ?? ""}
                        onChange={(e) =>
                          handleLimitChange(
                            tenant.id,
                            "maxTotalMonthlyTokens",
                            e.target.value,
                          )
                        }
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={t`Max total monthly tokens for ${tenant.name}`}
                      />
                    </td>
                    <td className={S.BodyCell}>
                      {/* TODO: placeholder should match the Per-user {period} token limit set in GeneralLimitsSettingsSection */}
                      <TextInput
                        placeholder={t`Unlimited`}
                        value={limits[tenant.id]?.maxTokensPerUser ?? ""}
                        onChange={(e) =>
                          handleLimitChange(
                            tenant.id,
                            "maxTokensPerUser",
                            e.target.value,
                          )
                        }
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={t`Max tokens per user for ${tenant.name}`}
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
