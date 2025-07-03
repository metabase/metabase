import type { ReactNode } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { MappingEditorEntry } from "metabase/common/components/MappingEditor";
import { Group, Icon, type SelectProps, Tooltip } from "metabase/ui";
import type { GroupTableAccessPolicy, Table, User } from "metabase-types/api";

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

const SystemDefined = () => (
  <Tooltip label={t`This attribute is system defined`}>
    <Icon name="info" c="text-light" />
  </Tooltip>
);

const TenantDefined = () => (
  <Tooltip
    label={t`This attribute is inherited from the tenant, but you can override its value`}
    maw="20rem"
  >
    <Icon name="info" c="text-light" />
  </Tooltip>
);

export const getSpecialEntries = (user?: User): MappingEditorEntry[] => {
  return Object.entries(user?.structured_attributes ?? {})
    .map(([key, { value, source, frozen, original }]) => ({
      key,
      value,
      keyOpts: {
        disabled: source !== "user" || !!original,
        leftSection: match(original?.source || source)
          .with("system", () => <SystemDefined />)
          .with("tenant", () => <TenantDefined />)
          .otherwise(() => null),
      },
      valueOpts: {
        disabled: frozen,
        revert: original,
      },
    }))
    .sort((a, b) =>
      // sort so that disabled keys and values are first
      String(a.keyOpts.disabled) + String(a.valueOpts.disabled) <
      String(b.keyOpts.disabled) + String(b.valueOpts.disabled)
        ? 1
        : -1,
    );
};
