import { useCallback, useState } from "react";

/** Inner tab of the Data palette (Browse) column. */
export type BrowseTab = "metrics" | "dimensions" | "timelines";

export interface ExplorationNavigation {
  browseTab: BrowseTab;
  setBrowseTab: (tab: BrowseTab) => void;
  /**
   * Switch the Data palette to a specific sub-tab — used by the
   * `NewExplorationData` section "+" buttons to deep-link a user
   * straight into the matching Browse picker.
   *
   * Historically this also flipped an outer "Chat | Add data" tab, but
   * the page now renders Chat, Research content, and Data palette as
   * three always-visible columns, so `openBrowse` is effectively an
   * alias for `setBrowseTab` (kept for naming clarity at call sites).
   */
  openBrowse: (tab: BrowseTab) => void;

  /**
   * The currently "selected" Research plan block, if any. When set, the
   * Data palette enters per-block mode: it switches to the cross-kind
   * tab (metric block → Dimensions, dim block → Metrics), filters its
   * list to entities related to the block, shows checkboxes that
   * reflect block membership, and routes toggles into the block's
   * add/remove mutators.
   *
   * `null` means we're in the default whole-exploration browse mode.
   */
  activeBlockId: string | null;

  /**
   * Activate a block by id. Also switches the browse tab to the cross
   * kind (`"dimensions"` for metric blocks, `"metrics"` for dimension
   * blocks). Idempotent if the block is already active.
   */
  selectBlock: (blockId: string, browseTab: BrowseTab) => void;

  /** Clear the active block — returns to default browse mode. */
  clearActiveBlock: () => void;
}

export function useExplorationNavigation(): ExplorationNavigation {
  const [browseTab, setBrowseTab] = useState<BrowseTab>("metrics");
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

  const openBrowse = useCallback((tab: BrowseTab) => {
    setBrowseTab(tab);
  }, []);

  const selectBlock = useCallback((blockId: string, tab: BrowseTab) => {
    setActiveBlockId(blockId);
    setBrowseTab(tab);
  }, []);

  const clearActiveBlock = useCallback(() => {
    setActiveBlockId(null);
  }, []);

  return {
    browseTab,
    setBrowseTab,
    openBrowse,
    activeBlockId,
    selectBlock,
    clearActiveBlock,
  };
}
