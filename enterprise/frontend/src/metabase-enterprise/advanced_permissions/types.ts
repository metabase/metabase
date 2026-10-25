import type { PartialBy } from "metabase/common/types";
import type { DatabaseId, GroupId, Impersonation } from "metabase-types/api";

export type ImpersonationParams = { groupId: GroupId; databaseId: DatabaseId };

export type ImpersonationDraft = PartialBy<Impersonation, "attribute">;

export type ImpersonationModalParams = {
  groupId?: string;
  impersonatedDatabaseId?: string;
  databaseId?: string;
};
