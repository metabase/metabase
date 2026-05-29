import { useCallback, useState } from "react";

export type BrowseTab = "metrics" | "dimensions" | "timelines";

export interface ExplorationNavigation {
  browseTab: BrowseTab;
  setBrowseTab: (tab: BrowseTab) => void;
  openBrowse: (tab: BrowseTab) => void;
  activeBlockId: string | null;
  selectBlock: (blockId: string, browseTab: BrowseTab) => void;
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
