import type { UserId } from "metabase-types/api";

export type InviteSentEvent = {
  event: "invite_sent";
  invited_user_id: UserId;
  source?: "setup" | "admin";
};

export type InviteEvent = InviteSentEvent;
