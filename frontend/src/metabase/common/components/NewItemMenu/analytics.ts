import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackNewMenuItemClicked = (
  item: "question" | "native-query" | "dashboard",
) =>
  trackSimpleEvent({
    event: "new_button_item_clicked",
    triggered_from: item,
  });
