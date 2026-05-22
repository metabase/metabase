import { useEffect, useRef } from "react";
import { routerActions } from "react-router-redux";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/redux";
import { getLocation } from "metabase/selectors/routing";
import { Icon } from "metabase/ui";

import {
  activateTab,
  addTab,
  removeTab,
  tabsSelectors,
  updateTab,
} from "../../tabs.slice";
import type { Tab as TabType } from "../../tabs.types";
import { iconForPath } from "../../utils/icon-for-path";

import { Tab } from "./Tab";
import S from "./TabBar.module.css";

const SHORTCUT_COUNT = 9;
const HOME_PATH = "/";

export function TabBar() {
  const dispatch = useDispatch();
  const tabs = useSelector(tabsSelectors.selectAll);
  const activeId = useSelector(tabsSelectors.selectActiveId);
  const pathname = useSelector((state) => getLocation(state).pathname) ?? "";

  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  useEffect(() => {
    if (!pathname) {
      return;
    }
    const icon = iconForPath(pathname);
    const activeTab = activeIdRef.current
      ? tabsRef.current.find((tab) => tab.id === activeIdRef.current)
      : undefined;
    if (!activeTab) {
      dispatch(
        addTab({ path: pathname, title: document.title || pathname, icon }),
      );
      return;
    }
    if (activeTab.path !== pathname || activeTab.icon !== icon) {
      dispatch(
        updateTab({ id: activeTab.id, changes: { path: pathname, icon } }),
      );
    }
  }, [pathname, dispatch]);

  useEffect(() => {
    const titleElement = document.querySelector("title");
    if (!titleElement) {
      return;
    }
    const syncTitle = () => {
      const title = document.title;
      if (!title) {
        return;
      }
      const activeTab = activeIdRef.current
        ? tabsRef.current.find((tab) => tab.id === activeIdRef.current)
        : undefined;
      if (activeTab && activeTab.title !== title) {
        dispatch(updateTab({ id: activeTab.id, changes: { title } }));
      }
    };
    syncTitle();
    const observer = new MutationObserver(syncTitle);
    observer.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => observer.disconnect();
  }, [dispatch]);

  useEffect(() => {
    const bindings: Record<string, (event: KeyboardEvent) => void> = {};
    for (let i = 1; i <= SHORTCUT_COUNT; i++) {
      bindings[`$mod+${i}`] = (event) => {
        event.preventDefault();
        const target = tabsRef.current[i - 1];
        if (target) {
          dispatch(activateTab(target.id));
          dispatch(routerActions.replace(target.path));
        }
      };
    }
    return tinykeys(window, bindings);
  }, [dispatch]);

  const handleActivate = (tab: TabType) => {
    dispatch(activateTab(tab.id));
    if (tab.path !== pathname) {
      dispatch(routerActions.replace(tab.path));
    }
  };

  const handleClose = (tab: TabType) => {
    const currentTabs = tabsRef.current;
    if (currentTabs.length <= 1) {
      return;
    }
    const closingIndex = currentTabs.findIndex((t) => t.id === tab.id);
    const wasActive = tab.id === activeIdRef.current;
    dispatch(removeTab(tab.id));
    if (wasActive && closingIndex !== -1) {
      const neighbor =
        closingIndex > 0
          ? currentTabs[closingIndex - 1]
          : currentTabs[closingIndex + 1];
      if (neighbor) {
        dispatch(activateTab(neighbor.id));
        dispatch(routerActions.replace(neighbor.path));
      }
    }
  };

  const handleAdd = () => {
    dispatch(addTab({ path: HOME_PATH, title: t`Home`, icon: "home" }));
    dispatch(routerActions.replace(HOME_PATH));
  };

  return (
    <div className={S.bar} role="tablist">
      {tabs.map((tab, index) => (
        <Tab
          key={tab.id}
          tab={tab}
          index={index}
          isActive={tab.id === activeId}
          canClose={tabs.length > 1}
          onActivate={handleActivate}
          onClose={handleClose}
        />
      ))}
      <button
        type="button"
        className={S.addButton}
        aria-label={t`Open a new tab`}
        onClick={handleAdd}
      >
        <Icon name="add" size={12} />
      </button>
    </div>
  );
}
