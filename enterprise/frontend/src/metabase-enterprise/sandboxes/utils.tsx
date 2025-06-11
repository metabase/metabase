import type { GroupTableAccessPolicy, Table } from "metabase-types/api";

import type { GroupTableAccessPolicyParams } from "./types";
import { type SelectProps, Group, Icon, Tooltip } from "metabase/ui";
import { ReactNode } from "react";

const TENANT_SLUG_ATTRIBUTE = "{{ tenant_slug }}";
const USER_ATTRIBUTE_DISPLAY_MAP = {
  [TENANT_SLUG_ATTRIBUTE]: "Tenant",
};

const USER_ATTRIBUTE_ICON_MAP: Record<string, ReactNode> = {
  [TENANT_SLUG_ATTRIBUTE]: (
    <Tooltip label="This user attribute is system defined">
      <Icon name="warning" />
    </Tooltip>
  ),
};

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
  <Group flex="1" p="0.5rem" gap="0.25rem">
    {option.label}
    {USER_ATTRIBUTE_ICON_MAP[option.value]}
  </Group>
);

export const getSelectDataForUserAttributes = (attributes: string[]) =>
  attributes.map((attribute) => ({
    label: formatUserAttribute(attribute),
    value: attribute,
  }));

export const formatUserAttribute = (attribute: string) => {
  return USER_ATTRIBUTE_DISPLAY_MAP[attribute] || attribute;
};
