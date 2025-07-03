import type { ReactNode } from "react";
import { t } from "ttag";

import type { MappingEditorEntry } from "metabase/common/components/MappingEditor";
import { Group, Icon, type SelectProps, Tooltip } from "metabase/ui";
import type { GroupTableAccessPolicy, Table, Tenant } from "metabase-types/api";

import type { GroupTableAccessPolicyParams } from "./types";

const TENANT_SLUG_ATTRIBUTE = "@tenant.slug";

const GET_USER_ATTRIBUTE_ICON_MAP: () => Record<string, ReactNode> = () => ({
  [TENANT_SLUG_ATTRIBUTE]: (
    <Tooltip label={t`This attribute is system defined`}>
      <Icon name="info" />
    </Tooltip>
  ),
});

export const getPolicyKeyFromParams = ({
  groupId,
  tableId,
}: GroupTableAccessPolicyParams) => `${groupId}:${tableId}`;

export const getPolicyKey = (policy: GroupTableAccessPolicy) =>
  `${policy.group_id}:${policy.table_id}`;

export const getRawDataQuestionForTable = (table: Table) => ({
  dataset_query: {
    type: "query",
    database: table?.db_id,
    query: { "source-table": table?.id },
  },
});

export const renderUserAttributesForSelect: SelectProps["renderOption"] = ({
  option,
}) => (
  <Group flex="1" p="sm" gap="xs" justify="space-between">
    {option.label}
    {GET_USER_ATTRIBUTE_ICON_MAP()[option.value]}
  </Group>
);

export const getDisabledTenantUserAttribute = (
  tenant?: Tenant,
): MappingEditorEntry[] => {
  if (tenant) {
    return [
      {
        key: TENANT_SLUG_ATTRIBUTE,
        value: tenant.slug,
        keyOpts: {
          leftSection: (
            <Tooltip label={t`This attribute is system defined`}>
              <Icon name="info" c="text-light" />
            </Tooltip>
          ),
        },
      },
    ];
  }

  return [];
};
