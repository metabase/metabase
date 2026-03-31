import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Stack, Text, TextInput } from "metabase/ui";
import type { GroupInfo } from "metabase-types/api";

import S from "./GroupLimitsSettingsSection.module.css";

type TenantGroupLimits = {
  maxTokensPerTenant: string;
  maxTokensPerUser: string;
};

type TenantGroupsTabProps = {
  tenantGroups: GroupInfo[] | undefined;
  isLoading: boolean;
  error: unknown;
};

export function TenantGroupsTab({
  tenantGroups,
  isLoading,
  error,
}: TenantGroupsTabProps) {
  const [limits, setLimits] = useState<Record<number, TenantGroupLimits>>({});

  const handleLimitChange = (
    groupId: number,
    field: keyof TenantGroupLimits,
    value: string,
  ) => {
    setLimits((prev) => ({
      ...prev,
      [groupId]: {
        maxTokensPerTenant: prev[groupId]?.maxTokensPerTenant ?? "",
        maxTokensPerUser: prev[groupId]?.maxTokensPerUser ?? "",
        [field]: value,
      },
    }));
  };

  return (
    <Stack gap="xl">
      <Text c="text-secondary">
        {t`Monthly limits for each individual user in each tenant group.`}
      </Text>
      <LoadingAndErrorWrapper
        loading={isLoading}
        error={error ? t`Error loading tenant groups` : null}
      >
        {tenantGroups && (
          <div className={S.TableContainer}>
            <table className={S.Table}>
              <thead>
                <tr>
                  <th className={S.HeaderCell}>{t`Tenant group`}</th>
                  <th className={S.HeaderCell}>
                    {t`Max tokens per tenant per month`}
                  </th>
                  <th className={S.HeaderCell}>
                    {t`Max tokens per user per month`}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tenantGroups.map((group) => (
                  <tr key={group.id} className={S.BodyRow}>
                    <td className={S.BodyCell}>{group.name}</td>
                    <td className={S.BodyCell}>
                      {/* TODO: placeholder should match the Per-user {period} token limit set in GeneralLimitsSettingsSection */}
                      <TextInput
                        placeholder={t`Unlimited`}
                        value={limits[group.id]?.maxTokensPerTenant ?? ""}
                        onChange={(e) =>
                          handleLimitChange(
                            group.id,
                            "maxTokensPerTenant",
                            e.target.value,
                          )
                        }
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={t`Max tokens per tenant for ${group.name}`}
                      />
                    </td>
                    <td className={S.BodyCell}>
                      {/* TODO: placeholder should match the Per-user {period} token limit set in GeneralLimitsSettingsSection */}
                      <TextInput
                        placeholder={t`Unlimited`}
                        value={limits[group.id]?.maxTokensPerUser ?? ""}
                        onChange={(e) =>
                          handleLimitChange(
                            group.id,
                            "maxTokensPerUser",
                            e.target.value,
                          )
                        }
                        classNames={{ input: S.LimitInput }}
                        type="number"
                        min={1}
                        aria-label={t`Max tokens per user for ${group.name}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </LoadingAndErrorWrapper>
    </Stack>
  );
}
