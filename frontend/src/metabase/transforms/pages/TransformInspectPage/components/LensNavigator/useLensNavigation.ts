import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { LensRef, LensTab } from "./types";
import { convertLensToRef, createTab, getLensRefKey } from "./utils";

type UseLensNavigationResult = {
  tabs: LensTab[];
  activeTabKey: string | null;
  currentLensRef: LensRef | undefined;
  addDrillLens: (lensRef: LensRef) => void;
  closeTab: (tabId: string) => void;
  switchTab: (tabId: string) => void;
};

export const useLensNavigation = (
  availableLenses: InspectorLensMetadata[],
  location: Location,
): UseLensNavigationResult => {
  const activeTabKey = location.query.tab?.toString() ?? null;

  const dispatch = useDispatch();
  const staticTabs = useMemo(
    () =>
      availableLenses.map((meta) =>
        createTab(convertLensToRef(meta), true, meta.complexity),
      ),
    [availableLenses],
  );

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
    const hasMatch = tabs.some((tab) => tab.id === activeTabKey);
    if (!hasMatch && tabs.length > 0) {
      navigate(tabs[0].id, true);
    }
  }, [tabs, activeTabKey, navigate]);

  const currentLensRef = useMemo(
    () => tabs.find((tab) => tab.id === activeTabKey)?.lensRef,
    [tabs, activeTabKey],
  );

  const addDrillLens = useCallback(
    (lensRef: LensRef) => {
      const key = getLensRefKey(lensRef);
      const existingTab = tabs.find((tab) => tab.id === key);
      if (existingTab) {
        navigate(key);
        return;
      }

      const newTab = createTab(lensRef, false);
      setDynamicTabs((prev) => [...prev, newTab]);
      navigate(key);
    },
    [tabs, navigate],
  );

  const closeTab = useCallback(
    (tabKey: string) => {
      const tab = tabs.find((t) => t.id === tabKey);
      if (!tab || tab.isStatic) {
        return;
      }

      const tabIndex = tabs.findIndex((t) => t.id === tabKey);
      setDynamicTabs((prev) => prev.filter((t) => t.id !== tabKey));

      if (activeTabKey === tabKey) {
        const remainingTabs = tabs.filter((t) => t.id !== tabKey);
        const newActiveIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const newActiveTab = remainingTabs[newActiveIndex];
        if (newActiveTab) {
          navigate(newActiveTab.id);
        }
      }
    },
    [tabs, activeTabKey, navigate],
  );

  const switchTab = useCallback(
    (tabKey: string) => navigate(tabKey, false),
    [navigate],
  );

  return {
    tabs,
    activeTabKey,
    currentLensRef,
    addDrillLens,
    closeTab,
    switchTab,
  };
};
