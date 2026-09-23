import type { TabAssignment, TabSpec } from "metabase/api/jev";
import { createNewTab, renameTab } from "metabase/dashboard/actions/tabs";
import { moveDashCardToTab } from "metabase/dashboard/actions/tabs-thunks";
import { getTabs } from "metabase/dashboard/selectors";
import type { Dispatch, GetState } from "metabase/redux/store";

/**
 * Apply a Jev tab-split plan to the LIVE (unsaved) dashboard edit state, so the user sees the
 * reorganization as a preview and commits with the normal Save button. Pure transient Redux — no
 * persistence here.
 *
 * Two dashboard-editor mechanics we have to respect:
 *  - On a dashboard with no tabs, the first `createNewTab()` creates TWO tabs (a "Tab 1" that every
 *    existing card is assigned to, plus the new one). So the requested tabs map onto tab slots created
 *    starting from that first pair.
 *  - `moveDashCardToTab` requires a card to already be on a tab — which holds once the initial tabs exist,
 *    since all cards land on tab 1.
 *
 * So: create enough tabs for the plan, read their ids back from state, rename them to the user's names,
 * then move each card to its assigned tab.
 */
export function applyTabSplit(tabs: TabSpec[], assignments: TabAssignment[]) {
  return (dispatch: Dispatch, getState: GetState) => {
    const existingTabCount = getTabs(getState()).length;

    // Creating the first tab on a tab-less dashboard yields two tabs; each subsequent call adds one.
    // We need `tabs.length` slots total beyond what already exists.
    const needed = tabs.length - existingTabCount;
    for (let i = 0; i < needed; i++) {
      dispatch(createNewTab());
    }

    // Read back the created tab ids in order; map the first `tabs.length` of them to the requested tabs.
    const tabIds = getTabs(getState())
      .slice(0, tabs.length)
      .map((t) => t.id);

    tabs.forEach((tab, index) => {
      const tabId = tabIds[index];
      if (tabId != null) {
        dispatch(renameTab({ tabId, name: tab.name }));
      }
    });

    for (const a of assignments) {
      const destinationTabId =
        a.tab_index != null ? tabIds[a.tab_index] : undefined;
      if (destinationTabId != null) {
        dispatch(
          moveDashCardToTab({ destinationTabId, dashCardId: a.dashcard_id }),
        );
      }
    }
  };
}
