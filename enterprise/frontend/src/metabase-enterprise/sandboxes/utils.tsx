import type { ReactNode } from "react";
import { t } from "ttag";

import { Group, Icon, type SelectProps, Tooltip } from "metabase/ui";
import type {
  GroupTableAccessPolicy,
  StructuredUserAttributes,
  Table,
  Tenant,
} from "metabase-types/api";

import type {
  GroupTableAccessPolicyParams,
  MappingEditorEntry,
  MappingType,
} from "./types";

const TENANT_SLUG_ATTRIBUTE = "@tenant.slug";

const GET_USER_ATTRIBUTE_ICON_MAP: () => Record<string, ReactNode> = () => ({
  [TENANT_SLUG_ATTRIBUTE]: (
    <Tooltip label={t`This attribute is system defined`}>
      <Icon data-testid="system-defined-tooltip-icon" name="info" />
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

// this needs to return a new array instead of mutating the original
// in order to trigger a re-render
export const addEntry = <T,>(entries: MappingEditorEntry<T>[]) => {
  return [...entries, { key: "", value: "" }];
};

export const removeEntry = <T,>(
  entries: MappingEditorEntry<T>[],
  index: number,
) => {
  return entries.toSpliced(index, 1);
};

export const replaceEntryValue = <T,>(
  entries: MappingEditorEntry<T>[],
  index: number,
  newValue: T,
) => {
  const newEntries = [...entries];
  newEntries[index].value = newValue;
  return newEntries;
};

export const replaceEntryKey = <T,>(
  entries: MappingEditorEntry<T>[],
  index: number,
  newKey: string,
) => {
  const newEntries = [...entries];
  newEntries[index].key = newKey;
  return newEntries;
};

export const buildEntries = <T,>(
  mapping?: MappingType<T>,
): MappingEditorEntry<T>[] =>
  Object.entries(mapping ?? {}).map(([key, value]) => ({ key, value }));

export const buildMapping = <T,>(
  entries: MappingEditorEntry<T>[],
): MappingType<T> =>
  entries.reduce((memo: MappingType<T>, { key, value }) => {
    if (key) {
      memo[key] = value;
    }
    return memo;
  }, {});

export const getExtraAttributes = (
  structuredAttributes?: StructuredUserAttributes,
  tenant?: Tenant,
): StructuredUserAttributes | undefined => {
  if (!tenant || structuredAttributes?.[TENANT_SLUG_ATTRIBUTE]) {
    return structuredAttributes;
  }

  // for newly created tenant users, we want to pre-populate their inherited attributes
  return {
    [TENANT_SLUG_ATTRIBUTE]: {
      value: tenant.slug,
      source: "tenant",
      frozen: true,
    },
    ...Object.fromEntries(
      Object.entries(tenant.attributes ?? {}).map(([key, value]) => [
        key,
        {
          value,
          source: "tenant",
          frozen: false,
        },
      ]),
    ),
  };
};
