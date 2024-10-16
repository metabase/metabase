import { trackSimpleEvent } from "metabase/lib/analytics";

import type { ChecklistItemValue } from "./types";

export const trackChecklistItemExpanded = (value: ChecklistItemValue) => {
  trackSimpleEvent({
    event: "onboarding_checklist_item_expanded",
    triggered_from: value,
  });
};
