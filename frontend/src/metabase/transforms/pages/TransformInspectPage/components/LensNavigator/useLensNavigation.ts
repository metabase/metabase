import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { LensRef, RouteParams } from "../../types";

import type { LensTab } from "./types";
import {
  createDynamicTab,
  createStaticTab,
  getLensKey,
  parseLocationParams,
} from "./utils";

type UseLensNavigationResult = {
  tabs: LensTab[];
  activeTabKey: string | undefined;
  currentLensRef: LensRef | undefined;
  navigateToLens: (lensRef: LensRef, isReplace?: boolean) => void;
  closeTab: (tabKey: string) => void;
  switchTab: (tabKey: string) => void;
  markLensAsLoaded: (lensKey: string) => void;
  updateTabTitle: (tabKey: string, title: string) => void;
  onLensError: (tabKey: string) => void;
};

export const useLensNavigation = (
  availableLenses: InspectorLensMetadata[],
  params: RouteParams,
  location: Location,
): UseLensNavigationResult => {
  const dispatch = useDispatch();
  const [loadedLenses, setLoadedLenses] = useState<Set<string>>(new Set());

  const [dynamicTabs, setDynamicTabs] = useState<LensTab[]>([]);
  const staticTabs = useMemo(
    () => availableLenses.map(createStaticTab),
    [availableLenses],
  );

  const tabs = useMemo(
    () =>
      [...staticTabs, ...dynamicTabs].map((tab) => ({
        ...tab,
        isFullyLoaded: loadedLenses.has(tab.key),
      })),
    [staticTabs, dynamicTabs, loadedLenses],
  );

  const currentLensRef = useMemo<LensRef | undefined>(() => {
    if (!params.lensId) {
      return undefined;
    }
    return { id: params.lensId, params: parseLocationParams(location.search) };
  }, [params.lensId, location.search]);

  const activeTabKey = currentLensRef ? getLensKey(currentLensRef) : undefined;

  const activeTab = useMemo(
    () => tabs.find(({ key }) => key === activeTabKey),
    [activeTabKey, tabs],
  );

  const basePath = useMemo(() => {
    const pathname = location.pathname;
    if (currentLensRef) {
      const lastSlash = pathname.lastIndexOf("/");
      return pathname.slice(0, lastSlash);
    }
    return pathname;
  }, [location.pathname, currentLensRef]);

  const addDynamicTab = (ref: LensRef) =>
    setDynamicTabs((prev) => {
      const key = getLensKey(ref);
      if (prev.some((tab) => tab.key === key)) {
        return prev;
      }
      return [...prev, createDynamicTab(ref)];
    });

  const removeDynamicTab = (tabKey: string) =>
    setDynamicTabs((prev) => prev.filter((tab) => tab.key !== tabKey));

  const navigate = useCallback(
    (ref: LensRef, isReplace: boolean = false) => {
      const action = isReplace ? replace : push;
      const path = `${basePath}/${ref.id}`;
      dispatch(action({ pathname: path, query: ref.params }));
    },
    [basePath, dispatch],
  );

  const navigateToLens = useCallback(
    (ref: LensRef, isReplace = false) => {
      const key = getLensKey(ref);
      const alreadyExists = tabs.some((tab) => tab.key === key);
      if (!alreadyExists) {
        addDynamicTab(ref);
      }
      navigate(ref, isReplace);
    },
    [tabs, navigate],
  );

  useEffect(() => {
    if (!activeTabKey && staticTabs.length > 0) {
      navigateToLens(staticTabs[0].lensRef, true);
    }
  }, [activeTabKey, staticTabs, navigateToLens]);

  useEffect(() => {
    if (currentLensRef && tabs.length > 0 && !activeTab) {
      navigateToLens(currentLensRef, true);
    }
  }, [activeTab, currentLensRef, tabs, navigateToLens]);

  const closeTab = useCallback(
    (tabKey: string) => {
      const tabIndex = tabs.findIndex(({ key }) => key === tabKey);
      const tab = tabs[tabIndex];
      if (!tab || tab.isStatic) {
        return;
      }
      removeDynamicTab(tabKey);
      if (activeTabKey === tabKey) {
        const remainingTabs = tabs.filter(({ key }) => key !== tabKey);
        const newActiveIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const newActiveTab = remainingTabs[newActiveIndex];
        if (newActiveTab) {
          navigate(newActiveTab.lensRef);
        }
      }
    },
    [tabs, activeTabKey, navigate],
  );

  const markLensAsLoaded = useCallback((lensKey: string) => {
    setLoadedLenses((prev) =>
      prev.has(lensKey) ? prev : new Set([...prev, lensKey]),
    );
  }, []);

  const switchTab = useCallback(
    (tabKey: string) => {
      const tab = tabs.find(({ key }) => key === tabKey);
      if (tab) {
        navigate(tab.lensRef);
      }
    },
    [navigate, tabs],
  );

  const updateTabTitle = useCallback((tabKey: string, title: string) => {
    setDynamicTabs((prev) =>
      prev.map((tab) => (tab.key === tabKey ? { ...tab, title } : tab)),
    );
  }, []);

  const onLensError = useCallback(
    (tabKey: string) => {
      removeDynamicTab(tabKey);
      if (staticTabs.length > 0) {
        navigate(staticTabs[0].lensRef, true);
      }
    },
    [staticTabs, navigate],
  );

  return {
    tabs,
    activeTabKey,
    currentLensRef,
    navigateToLens,
    closeTab,
    switchTab,
    markLensAsLoaded,
    updateTabTitle,
    onLensError,
  };
};
