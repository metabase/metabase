import { trackSimpleEvent } from "metabase/analytics";
import type { ChecklistItemValue } from "metabase/redux/store";

import type { ChecklistItemCTA } from "./types";

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
