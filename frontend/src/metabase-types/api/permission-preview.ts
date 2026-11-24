import type { GroupId } from "./group";
import type { UserAttributeMap, UserId } from "./user";

export type PermissionPreviewId = number;

export type StartPermissionPreviewRequest =
  | { user_id: UserId }
  | { group_id: GroupId; attributes?: UserAttributeMap };

export type PermissionPreviewSession = {
  id: PermissionPreviewId;
  token: string;
  expires_at: string;
};
