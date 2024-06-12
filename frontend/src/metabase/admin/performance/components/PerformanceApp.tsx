import { useLayoutEffect, useRef, useState } from "react";
import type { Route } from "react-router";
import { t } from "ttag";

import type { TabsValue } from "metabase/ui";
import { Flex, Tabs } from "metabase/ui";

import { PerformanceTabId } from "../types";

import { ModelPersistenceConfiguration } from "./ModelPersistenceConfiguration";
import { Tab, TabsList, TabsPanel } from "./PerformanceApp.styled";
import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

const validTabIds = new Set(Object.values(PerformanceTabId).map(String));
const isValidTabId = (tab: TabsValue): tab is PerformanceTabId =>
  !!tab && validTabIds.has(tab);

export const PerformanceApp = ({ route }: { route: Route }) => {
  const [tabId, setTabId] = useState<PerformanceTabId>(
    PerformanceTabId.DataCachingSettings,
  );
  const [tabsHeight, setTabsHeight] = useState<number>(300);
  const tabsRef = useRef<HTMLDivElement>(null);

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
        <Tab
          key={PerformanceTabId.DataCachingSettings}
          value={PerformanceTabId.DataCachingSettings}
        >
          {t`Database caching settings`}
        </Tab>
        <Tab key="ModelPersistence" value={PerformanceTabId.ModelPersistence}>
          {t`Model persistence`}
        </Tab>
      </TabsList>
      <TabsPanel key={tabId} value={tabId}>
        {tabId === PerformanceTabId.DataCachingSettings && (
          <Flex style={{ flex: 1, overflow: "hidden" }} bg="bg-light" h="100%">
            <StrategyEditorForDatabases route={route} />
          </Flex>
        )}
        {tabId === PerformanceTabId.ModelPersistence && (
          <Flex style={{ flex: 1 }} bg="bg-light" h="100%">
            <ModelPersistenceConfiguration />
          </Flex>
        )}
      </TabsPanel>
    </Tabs>
  );
};
