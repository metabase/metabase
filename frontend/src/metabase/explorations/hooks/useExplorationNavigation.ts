import { useCallback, useState } from "react";

/** Outer tab of the new-exploration left pane. */
export type LeftTab = "chat" | "browse";

/** Inner tab of the Browse panel. */
export type BrowseTab = "metrics" | "dimensions" | "timelines";

export interface ExplorationNavigation {
  leftTab: LeftTab;
  setLeftTab: (tab: LeftTab) => void;
  browseTab: BrowseTab;
  setBrowseTab: (tab: BrowseTab) => void;
  openBrowse: (tab: BrowseTab) => void;
}

export function useExplorationNavigation(): ExplorationNavigation {
  const [leftTab, setLeftTab] = useState<LeftTab>("chat");
  const [browseTab, setBrowseTab] = useState<BrowseTab>("metrics");

  const openBrowse = useCallback((tab: BrowseTab) => {
    setBrowseTab(tab);
    setLeftTab("browse");
  }, []);

  return { leftTab, setLeftTab, browseTab, setBrowseTab, openBrowse };
}
