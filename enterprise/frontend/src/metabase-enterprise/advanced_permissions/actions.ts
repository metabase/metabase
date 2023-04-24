import { push } from "react-router-redux";
import { GroupId } from "metabase-types/api";
import { EntityId } from "metabase/admin/permissions/types";
import {
  DATABASES_BASE_PATH,
  GROUPS_BASE_PATH,
} from "metabase/admin/permissions/utils/urls";

export const getImpersonatedPostAction = (
  entityId: EntityId,
  groupId: GroupId,
  view: "database" | "group",
) =>
  view === "database"
    ? push(
        `${DATABASES_BASE_PATH}/${entityId.databaseId}/impersonated/group/${groupId}`,
      )
    : push(
        `${GROUPS_BASE_PATH}/${groupId}/impersonated/database/${entityId.databaseId}`,
      );
