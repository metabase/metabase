import { createMockMetadata } from "__support__/metadata";
import * as Lib from "metabase-lib";
import type { Field, Table } from "metabase-types/api";
import {
  createMockDatabase,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";

const AUDIT_DB_ID = 13371337;
const CONVERSATIONS_TABLE_ID = 1001;
const USAGE_LOG_TABLE_ID = 1002;
const GROUP_MEMBERS_TABLE_ID = 1003;

const BASE_TYPE_BY_FIELD_TYPE = {
  text: "type/Text",
  integer: "type/Integer",
  bigInteger: "type/BigInteger",
  dateTime: "type/DateTimeWithLocalTZ",
} as const;

const buildTable = (
  id: number,
  name: string,
  display_name: string,
  fields: Array<
    [
      type: keyof typeof BASE_TYPE_BY_FIELD_TYPE,
      name: string,
      semantic_type: Field["semantic_type"],
    ]
  >,
): Table =>
  createMockTable({
    id,
    db_id: AUDIT_DB_ID,
    schema: "public",
    name,
    display_name,
    fields: fields.map(([type, fieldName, semantic_type], i) =>
      createMockField({
        id: id * 100 + i,
        table_id: id,
        name: fieldName,
        display_name: fieldName,
        fingerprint: null,
        base_type: BASE_TYPE_BY_FIELD_TYPE[type],
        effective_type: BASE_TYPE_BY_FIELD_TYPE[type],
        semantic_type,
      }),
    ),
  });

const conversationsTable = buildTable(
  CONVERSATIONS_TABLE_ID,
  "v_metabot_conversations",
  "Conversations",
  [
    ["text", "conversation_id", "type/PK"],
    ["dateTime", "created_at", "type/CreationTimestamp"],
    ["integer", "user_id", "type/FK"],
    ["integer", "tenant_id", "type/FK"],
    ["text", "user_display_name", "type/Name"],
    ["text", "source_name", "type/Category"],
    ["text", "profile_name", "type/Category"],
    ["text", "ip_address", null],
    ["bigInteger", "message_count", "type/Quantity"],
    ["bigInteger", "prompt_tokens", "type/Quantity"],
    ["bigInteger", "completion_tokens", "type/Quantity"],
  ],
);

const usageLogTable = buildTable(
  USAGE_LOG_TABLE_ID,
  "v_ai_usage_log",
  "Usage Log",
  [
    ["bigInteger", "usage_log_id", "type/PK"],
    ["dateTime", "created_at", "type/CreationTimestamp"],
    ["integer", "user_id", "type/FK"],
    ["integer", "tenant_id", "type/FK"],
    ["text", "user_display_name", "type/Name"],
    ["text", "source_name", "type/Category"],
    ["text", "profile_name", "type/Category"],
    ["text", "ip_address", null],
    ["integer", "prompt_tokens", "type/Quantity"],
    ["integer", "completion_tokens", "type/Quantity"],
  ],
);

const groupMembersTable = buildTable(
  GROUP_MEMBERS_TABLE_ID,
  "v_group_members",
  "Group Members",
  [
    ["integer", "user_id", "type/Description"],
    ["integer", "group_id", "type/PK"],
    ["text", "group_name", "type/Name"],
  ],
);

export function buildAuditViewsFixture() {
  const database = createMockDatabase({
    id: AUDIT_DB_ID,
    // eslint-disable-next-line metabase/no-literal-metabase-strings -- test fixture
    name: "Internal Metabase Database",
    tables: [conversationsTable, usageLogTable, groupMembersTable],
  });
  const metadata = createMockMetadata({ databases: [database] });
  const provider = Lib.metadataProvider(AUDIT_DB_ID, metadata);

  return {
    provider,
    conversations: Lib.tableOrCardMetadata(provider, CONVERSATIONS_TABLE_ID)!,
    usageLog: Lib.tableOrCardMetadata(provider, USAGE_LOG_TABLE_ID)!,
    groupMembers: Lib.tableOrCardMetadata(provider, GROUP_MEMBERS_TABLE_ID)!,
  };
}
