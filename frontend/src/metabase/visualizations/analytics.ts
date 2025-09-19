import { trackSimpleEvent } from "metabase/lib/analytics";

import type { RegularClickAction } from "./types";

export const trackClickActionPerformed = (action: RegularClickAction) => {
  trackSimpleEvent({
    event: "click_action",
    triggered_from: action.section,
  });
};
