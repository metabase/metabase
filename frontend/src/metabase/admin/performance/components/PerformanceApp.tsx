import { useLayoutEffect, useRef, useState } from "react";
import { t } from "ttag";

import { PLUGIN_CACHING } from "metabase/plugins";
import { Flex, Tabs } from "metabase/ui";

import { isValidTabId, TabId } from "../types";

import { Tab, TabsList, TabsPanel } from "./PerformanceApp.styled";
import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

export const PerformanceApp = () => {
  const [tabId, setTabId] = useState<TabId>(TabId.DataCachingSettings);
  const [tabsHeight, setTabsHeight] = useState<number>(300);
  const tabsRef = useRef<HTMLDivElement>(null);

  const { canOverrideRootCacheInvalidationStrategy } = PLUGIN_CACHING;

  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef?.current;
      if (!tabs) {
        return;
      }
      const tabsElementTop = tabs.getBoundingClientRect().top;
      const newHeight = window.innerHeight - tabsElementTop - tabs.clientTop;
      setTabsHeight?.(newHeight);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    setTimeout(handleResize, 50);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [tabsRef, setTabsHeight]);

  // TODO: The horizontal row of tabs does not look so good in narrow viewports
  return (
    <Tabs
      value={tabId}
      onTabChange={value => {
        if (isValidTabId(value)) {
          setTabId(value);
          // perhaps later use: dispatch(push(`/admin/performance/${value}`));
          // or history.pushState to avoid reloading too large a portion of the ui?
        } else {
          console.error("Invalid tab value", value);
        }
      }}
      style={{ display: "flex", flexDirection: "column" }}
      ref={tabsRef}
      bg="bg-light"
      h={tabsHeight}
    >
      <TabsList>
        <Tab key={"DataCachingSettings"} value={TabId.DataCachingSettings}>
          {t`Data caching settings`}
        </Tab>
      </TabsList>
      <TabsPanel key={tabId} value={tabId} p="1rem 2.5rem">
        <Flex style={{ flex: 1 }} bg="bg-light" h="100%">
          <StrategyEditorForDatabases
            canOverrideRootCacheInvalidationStrategy={
              canOverrideRootCacheInvalidationStrategy
            }
          />
        </Flex>
      </TabsPanel>
    </Tabs>
  );
};
