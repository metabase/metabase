import { trackSimpleEvent } from "metabase/utils/analytics";

export const trackNewsletterToggleClicked = (optedIn: boolean) =>
  trackSimpleEvent({
    event: "newsletter-toggle-clicked",
    triggered_from: "setup",
    event_detail: optedIn ? "opted-in" : "opted-out",
  });
