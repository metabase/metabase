import type { Location } from "history";
import { useCallback, useEffect, useMemo, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import type { InspectorLensMetadata } from "metabase-types/api";

import type { LensHandle, RouteParams } from "../../types";

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
  currentLensHandle: LensHandle | undefined;
  navigateToLens: (lensHandle: LensHandle, isReplace?: boolean) => void;
  closeTab: (tabKey: string) => void;
  switchTab: (tabKey: string) => void;
  markLensAsLoaded: (lensKey: string) => void;
  updateTabTitle: (tabKey: string, title: string) => void;
  onLensError: (lensHandle: LensHandle, error: unknown) => void;
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

  const currentLensHandle = useMemo<LensHandle | undefined>(() => {
    if (!params.lensId) {
      return undefined;
    }
    return { id: params.lensId, params: parseLocationParams(location.search) };
  }, [params.lensId, location.search]);

  const activeTabKey = currentLensHandle
    ? getLensKey(currentLensHandle)
    : undefined;

  const activeTab = useMemo(
    () => tabs.find(({ key }) => key === activeTabKey),
    [activeTabKey, tabs],
  );

  const basePath = useMemo(() => {
    const pathname = location.pathname;
    if (currentLensHandle) {
      const lastSlash = pathname.lastIndexOf("/");
      return pathname.slice(0, lastSlash);
    }
    return pathname;
  }, [location.pathname, currentLensHandle]);

  const addDynamicTab = (handle: LensHandle) =>
    setDynamicTabs((prev) => {
      const key = getLensKey(handle);
      if (prev.some((tab) => tab.key === key)) {
        return prev;
      }
      return [...prev, createDynamicTab(handle)];
    });

  const removeDynamicTab = (handle: LensHandle) =>
    setDynamicTabs((prev) => {
      const key = getLensKey(handle);
      return prev.filter((tab) => tab.key !== key);
    });

  const navigate = useCallback(
    (handle: LensHandle, isReplace: boolean = false) => {
      const action = isReplace ? replace : push;
      const path = `${basePath}/${handle.id}`;
      dispatch(action({ pathname: path, query: handle.params }));
    },
    [basePath, dispatch],
  );

  const navigateToLens = useCallback(
    (handle: LensHandle, isReplace = false) => {
      const key = getLensKey(handle);
      const alreadyExists = tabs.some((tab) => tab.key === key);
      if (!alreadyExists) {
        addDynamicTab(handle);
      }
      navigate(handle, isReplace);
    },
    [tabs, navigate],
  );

  useEffect(() => {
    if (!activeTabKey && staticTabs.length > 0) {
      navigateToLens(staticTabs[0].lensHandle, true);
    }
  }, [activeTabKey, staticTabs, navigateToLens]);

  useEffect(() => {
    if (currentLensHandle && tabs.length > 0 && !activeTab) {
      navigateToLens(currentLensHandle, true);
    }
  }, [activeTab, currentLensHandle, tabs, navigateToLens]);

  const closeTab = useCallback(
    (tabKey: string) => {
      const tabIndex = tabs.findIndex(({ key }) => key === tabKey);
      const tab = tabs[tabIndex];
      if (!tab || tab.isStatic) {
        return;
      }
      removeDynamicTab(tab.lensHandle);
      if (activeTabKey === tabKey) {
        const remainingTabs = tabs.filter(({ key }) => key !== tabKey);
        const newActiveIndex = Math.min(tabIndex, remainingTabs.length - 1);
        const newActiveTab = remainingTabs[newActiveIndex];
        if (newActiveTab) {
          navigate(newActiveTab.lensHandle);
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
        navigate(tab.lensHandle);
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
    (lensHandle: LensHandle) => {
      const tabKey = getLensKey(lensHandle);
      updateTabTitle(tabKey, t`Error`);
    },
    [updateTabTitle],
  );

  return {
    tabs,
    activeTabKey,
    currentLensHandle,
    navigateToLens,
    closeTab,
    switchTab,
    markLensAsLoaded,
    updateTabTitle,
    onLensError,
  };
};
