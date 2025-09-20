import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetabotChatOpened = (
  origin: "search" | "command_palette" | "keyboard_shortcut",
) => {
  trackSimpleEvent({
    event: "metabot_chat_opened",
    triggered_from: origin,
  });
};

export const trackMetabotRequestSent = () => {
  trackSimpleEvent({
    event: "metabot_request_sent",
  });
};
