import { useLayoutEffect, useRef, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import { PLUGIN_CACHING } from "metabase/plugins";
import { Flex, Tabs } from "metabase/ui";

import { TabId } from "../types";
import { isValidTabId } from "../validation";

import { Tab, TabsList, TabsPanel } from "./PerformanceApp.styled";
import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

export const PerformanceApp = ({ route }: { route: Route }) => {
  const [tabId, setTabId] = useState<TabId>(TabId.DataCachingSettings);
  const [tabsHeight, setTabsHeight] = useState<number>(300);
  const tabsRef = useRef<HTMLDivElement>(null);

  const { canOverrideRootStrategy } = PLUGIN_CACHING;

  useLayoutEffect(() => {
    const handleResize = () => {
      const tabs = tabsRef?.current;
      if (!tabs) {
        return;
      }
      const tabsElementTop = tabs.getBoundingClientRect().top;
      const newHeight = window.innerHeight - tabsElementTop - tabs.clientTop;
      setTabsHeight(newHeight);
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    // TODO: Is this needed?
    // setTimeout(handleResize, 50);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [tabsRef, setTabsHeight]);

  return (
    <Tabs
      value={tabId}
      onTabChange={value => {
        if (isValidTabId(value)) {
          setTabId(value);
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
        <Tab key="DataCachingSettings" value={TabId.DataCachingSettings}>
          {t`Data caching settings`}
        </Tab>
      </TabsList>
      <TabsPanel key={tabId} value={tabId} p="1rem 2.5rem">
        <Flex style={{ flex: 1 }} bg="bg-light" h="100%">
          <StrategyEditorForDatabases
            route={route}
            canOverrideRootStrategy={canOverrideRootStrategy}
          />
        </Flex>
      </TabsPanel>
    </Tabs>
  );
};
