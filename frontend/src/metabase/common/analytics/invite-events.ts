import { trackSimpleEvent } from "metabase/analytics";
import type {
  InviteToViewOpenedEvent,
  UserInvitedEvent,
} from "metabase-types/analytics";

export const trackUserInvited = (params: {
  triggeredFrom: UserInvitedEvent["triggered_from"];
  targetId: UserInvitedEvent["target_id"];
  result: UserInvitedEvent["result"];
  eventDetail: UserInvitedEvent["event_detail"];
}) =>
  trackSimpleEvent({
    event: "user_invited",
    triggered_from: params.triggeredFrom,
    target_id: params.targetId,
    result: params.result,
    event_detail: params.eventDetail,
  });

export const trackInviteToViewOpened = (params: {
  triggeredFrom: InviteToViewOpenedEvent["triggered_from"];
  targetId: InviteToViewOpenedEvent["target_id"];
}) =>
  trackSimpleEvent({
    event: "invite_to_view_opened",
    triggered_from: params.triggeredFrom,
    target_id: params.targetId,
  });
