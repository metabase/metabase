import { Mode } from "metabase/querying/click-actions/Mode";
import { getQueryMode } from "metabase/querying/click-actions/lib/modes";
import type { ClickAction } from "metabase/visualizations/types";

import { getNarrowedQuery } from "./narrow";
import { updateExploreQuestion } from "./use-explore-update";
import { withExploreQuery } from "./utils";

/**
 * Click actions for explore mode: clicking a summarized value narrows the slice to it right
 * away, instead of opening the drill menu. Clicks on raw rows and headers work as usual.
 */
export const exploreClickMode = new Mode(getQueryMode, {
  hasColumnShortcutActions: true,
  mapActions: (actions, clicked, question): ClickAction[] => {
    const narrowedQuery = getNarrowedQuery(question, clicked);
    if (narrowedQuery == null) {
      return actions;
    }
    return [
      {
        name: "explore.narrow",
        defaultAlways: true,
        onClick: ({ dispatch }) => {
          void dispatch(
            updateExploreQuestion(
              question,
              withExploreQuery(question, narrowedQuery),
            ),
          );
        },
      },
      ...actions,
    ];
  },
});
