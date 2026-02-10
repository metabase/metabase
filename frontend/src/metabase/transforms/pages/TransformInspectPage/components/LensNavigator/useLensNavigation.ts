import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { TriggeredDrillLens } from "metabase-lib/transforms-inspector";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { Lens } from "../../types";

import type { LensTab } from "./types";
import { createTab } from "./utils";

type UseLensNavigationResult = {
  tabs: LensTab[];
  activeTabKey: string | null;
  currentLens: Lens | undefined;
  addDrillLens: (lens: TriggeredDrillLens) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
  handleAllCardsLoaded: (lensId: string) => void;
};

export const useLensNavigation = (
  availableLenses: InspectorLensMetadata[],
  location: Location,
): UseLensNavigationResult => {
  const activeTabKey = location.query.tab?.toString() ?? null;
  const [staticTabs, setStaticTabs] = useState<LensTab[]>([]);

  const dispatch = useDispatch();

  useEffect(() => {
    setStaticTabs(() => availableLenses.map(createTab));
  }, [availableLenses]);

  const [dynamicTabs, setDynamicTabs] = useState<LensTab[]>([]);

  const tabs = useMemo(
    () => [...staticTabs, ...dynamicTabs],
    [staticTabs, dynamicTabs],
  );

  const navigate = useCallback(
    (key: string, isReplace = false) => {
      const action = isReplace ? replace : push;
      dispatch(action({ pathname: location.pathname, query: { tab: key } }));
    },
    [dispatch, location.pathname],
  );

  useEffect(() => {
    const hasMatch = tabs.some((tab) => tab.key === activeTabKey);
    if (!hasMatch && tabs.length > 0) {
      navigate(tabs[0].key, true);
    }
  }, [tabs, activeTabKey, navigate]);

  const currentLens = useMemo(
    () => tabs.find((tab) => tab.key === activeTabKey)?.lens,
    [tabs, activeTabKey],
  );

  const addDrillLens = useCallback(
    (lens: TriggeredDrillLens) => {
      const newTab = createTab(lens);
      const existingTab = tabs.find((tab) => tab.key === newTab.key);
      if (!existingTab) {
        setDynamicTabs((prev) => [...prev, newTab]);
      }
      navigate(newTab.key);
    },
    [tabs, navigate],
  );

  const closeTab = useCallback(
    (tabKey: string) => {
      const tab = tabs.find((t) => t.key === tabKey);
      if (!tab || tab.isStatic) {
        return;
      }

      const tabIndex = tabs.findIndex((t) => t.key === tabKey);
      setDynamicTabs((prev) => prev.filter((t) => t.key !== tabKey));

      if (activeTabKey === tabKey) {
        const remainingTabs = tabs.filter((t) => t.key !== tabKey);
        const newActiveIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const newActiveTab = remainingTabs[newActiveIndex];
        if (newActiveTab) {
          navigate(newActiveTab.key);
        }
      }
    },
    [tabs, activeTabKey, navigate],
  );

  const handleAllCardsLoaded = useCallback((lensId: string) => {
    setDynamicTabs((prev) =>
      prev.map((tab) =>
        tab.key === lensId ? { ...tab, isFullyLoaded: true } : tab,
      ),
    );
    setStaticTabs((prev) =>
      prev.map((tab) =>
        tab.key === lensId ? { ...tab, isFullyLoaded: true } : tab,
      ),
    );
  }, []);

  const switchTab = useCallback(
    (tabKey: string) => navigate(tabKey, false),
    [navigate],
  );

  return {
    tabs,
    activeTabKey,
    currentLens,
    addDrillLens,
    closeTab,
    switchTab,
    handleAllCardsLoaded,
  };
};
