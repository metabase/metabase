import { trackSimpleEvent } from "metabase/lib/analytics";

export const trackMetabotChatOpened = (
  origin: "header" | "command_palette" | "keyboard_shortcut" | "native_editor",
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

export const trackQueryFixClicked = () => {
  trackSimpleEvent({
    event: "metabot_fix_query_clicked",
  });
};

export const trackExplainChartClicked = () => {
  trackSimpleEvent({
    event: "metabot_explain_chart_clicked",
  });
};
