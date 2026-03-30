import { trackSimpleEvent } from "metabase/lib/analytics";
import type { ValidateEvent } from "metabase-types/analytics/event";

import type { ChecklistItemCTA, ChecklistItemValue } from "./types";

type OnboardingChecklistItemExpandedEvent = ValidateEvent<{
  event: "onboarding_checklist_item_expanded";
  triggered_from: ChecklistItemValue;
}>;

type OnboardingChecklistItemCTAClickedEvent = ValidateEvent<{
  event: "onboarding_checklist_cta_clicked";
  triggered_from: ChecklistItemValue;
  event_detail: ChecklistItemCTA;
}>;

declare module "metabase-types/analytics/event" {
  interface SimpleEventExtensions {
    onboardingChecklistItemExpanded: OnboardingChecklistItemExpandedEvent;
    onboardingChecklistItemCTAClicked: OnboardingChecklistItemCTAClickedEvent;
  }
}

export const trackChecklistItemExpanded = (value: ChecklistItemValue) => {
  trackSimpleEvent({
    event: "onboarding_checklist_item_expanded",
    triggered_from: value,
  });
};

export const trackChecklistItemCTAClicked = (
  value: ChecklistItemValue,
  cta: ChecklistItemCTA = "primary",
) => {
  trackSimpleEvent({
    event: "onboarding_checklist_cta_clicked",
    triggered_from: value,
    event_detail: cta,
  });
};
