import { useDebouncedCallback } from "@mantine/hooks";
import { useEffect, useMemo, useState } from "react";
import { c, t } from "ttag";
import { type Dictionary, isEmpty } from "underscore";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Alert, Box, Icon, Stack, Text, TextInput } from "metabase/ui";
import { useUpdateAIControlsTenantLimitMutation } from "metabase-enterprise/api";
import type {
  MetabotLimitPeriod,
  MetabotLimitType,
  MetabotTenantLimit,
  Tenant,
} from "metabase-types/api";

import {
  MAX_LIMIT_INPUT,
  SAVE_DEBOUNCE_MS,
  getLimitPeriodLabel,
} from "../utils";

import S from "./GroupLimitsSettingsSection.module.css";

type SpecificTenantsTabProps = {
  error: unknown;
  instanceLimit: number | null;
  isLoading: boolean;
  limitPeriod: MetabotLimitPeriod;
  limitType: MetabotLimitType;
  tenantLimits: MetabotTenantLimit[];
  tenants: Tenant[] | undefined;
};

export function TenantLimitsTab({
  error,
  instanceLimit,
  isLoading,
  limitPeriod,
  limitType,
  tenantLimits,
  tenants,
}: SpecificTenantsTabProps) {
  const [search, setSearch] = useState("");
  const [updateTenantLimit] = useUpdateAIControlsTenantLimitMutation();
  const [localLimitsMap, setLocalLimitsMap] = useState<Dictionary<number>>({});
  const limitsMap = useMemo(
    () =>
      (tenantLimits || []).reduce((map, limitObj) => {
        return { ...map, [limitObj.tenant_id]: limitObj.max_usage };
      }, {} as Dictionary<number>),
    [tenantLimits],
  );
  const { sendErrorToast } = useMetadataToasts();

  // Local state initialization
  useEffect(() => {
    if (!isEmpty(localLimitsMap) || isEmpty(limitsMap)) {
      return;
    }

    setLocalLimitsMap(limitsMap);
  }, [limitsMap, localLimitsMap]);

  const debouncedSaveTenantLimits = useDebouncedCallback(async () => {
    for (const tenantId in localLimitsMap) {
      if (limitsMap[tenantId] !== localLimitsMap[tenantId]) {
        updateTenantLimit({
          tenantId: Number(tenantId),
          max_usage: localLimitsMap[tenantId],
        })
          .unwrap()
          .catch(() => {
            sendErrorToast(t`Failed to update a tenant limit`);
          });
      }
    }
  }, SAVE_DEBOUNCE_MS);

  const handleChange = (tenantId: number, value: string) => {
    let sanitizedValue = value;

    if (sanitizedValue !== "") {
      sanitizedValue = Math.min(Number(value), MAX_LIMIT_INPUT).toString();
    }

    setLocalLimitsMap((prev) => ({
      ...prev,
      [tenantId]: sanitizedValue ? Number(sanitizedValue) : null,
    }));
    debouncedSaveTenantLimits();
  };

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

  const noTenantsToShow = tenants?.length === 0 && !error && !isLoading;
  const { adjective: periodAdjective, i18nContext: periodI18nContext } =
    getLimitPeriodLabel(limitPeriod);
  const placeholder =
    instanceLimit != null ? String(instanceLimit) : t`Unlimited`;

  return (
    <Stack gap="xl" data-testid="tenant-limits-tab">
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
                              .t`Max total ${periodAdjective} message count`}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTenants.map((tenant) => (
                      <tr key={tenant.id} className={S.BodyRow}>
                        <td className={S.BodyCell}>{tenant.name}</td>
                        <td className={S.BodyCell}>
                          <TextInput
                            placeholder={placeholder}
                            value={localLimitsMap?.[tenant.id] ?? ""}
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
                                    .t`Max total ${periodAdjective} messages for ${tenant.name}`
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
