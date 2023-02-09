import { GroupTableAccessPolicy, TableId } from "metabase-types/api";
import { GroupTableAccessPolicyParams } from "./types";

export const getPolicyKeyFromParams = ({
  groupId,
  tableId,
}: GroupTableAccessPolicyParams) => `${groupId}:${tableId}`;

export const getPolicyKey = (policy: GroupTableAccessPolicy) =>
  `${policy.group_id}:${policy.table_id}`;

export const getRawDataQuestionForTable = (tableId: TableId) => ({
  dataset_query: {
    type: "query",
    query: { "source-table": tableId },
  },
});
