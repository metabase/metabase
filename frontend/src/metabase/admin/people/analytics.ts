import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackInviteSent = (invitedUserId: number) => {
  trackSchemaEvent("invite", {
    event: "invite_sent",
    source: "admin",
    invited_user_id: invitedUserId,
  });
};
