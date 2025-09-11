import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetabotChatOpened = () => {
  trackSimpleEvent({
    event: "metabot_chat_opened",
    triggered_from: "search",
  });
};

export const trackMetabotRequestSent = () => {
  trackSimpleEvent({
    event: "metabot_request_sent",
  });
};
