import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetabotChatOpened = () => {
  trackSimpleEvent({
    event: "metabot_chat_opened",
    triggered_from: "search",
  });
};
