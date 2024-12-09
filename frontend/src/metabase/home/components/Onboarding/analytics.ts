import { trackSimpleEvent } from "metabase/lib/analytics";

import type { ChecklistItemCTA, ChecklistItemValue } from "./types";

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
