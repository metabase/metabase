import type {
  GroupId,
  GroupTableAccessPolicy,
  ParameterTarget,
  TableId,
  UserAttributeKey,
} from "metabase-types/api";

export type GroupTableAccessPolicyParams = {
  groupId: GroupId | string;
  tableId: TableId | string;
};

export type GroupTableAccessPolicyDraft = Pick<
  GroupTableAccessPolicy,
  "card_id" | "table_id" | "group_id"
> & {
  attribute_remappings: {
    [key: string]: string | ParameterTarget | null;
  };
};

export type MappingEditorEntry<T = string> = {
  key: UserAttributeKey;
  value: T;
};

export type DataAttributeMap<T = string> = Record<UserAttributeKey, T>;

export type MappingType<T = string> = Record<UserAttributeKey, T>;
