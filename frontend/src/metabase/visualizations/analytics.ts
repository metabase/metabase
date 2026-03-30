import { match } from "ts-pattern";

import { trackSimpleEvent } from "metabase/lib/analytics";
import type { ValidateEvent } from "metabase-types/analytics/event";

import type { ClickActionSection, RegularClickAction } from "./types";

type ClickActionPerformedEvent = ValidateEvent<{
  event: "click_action";
  triggered_from: ClickActionSection;
}>;

declare module "metabase-types/analytics/event" {
  interface SimpleEventExtensions {
    clickAction: ClickActionPerformedEvent;
  }
}

export const trackClickActionPerformed = (action: RegularClickAction) => {
  trackSimpleEvent({
    event: "click_action",
    triggered_from: action.section,
  });

  if (action.section === "auto-popover") {
    const event = match(action.name)
      .with("automatic-insights.compare", () => "compare_to_rest" as const)
      .with("automatic-insights.xray", () => "x-ray" as const)
      .otherwise(() => "x-ray" as const);

    trackSimpleEvent({
      event: "x-ray_automatic_insights_clicked",
      event_detail: event,
    });
  }
};
