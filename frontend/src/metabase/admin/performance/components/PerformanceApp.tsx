import classNames from "classnames";
import { useLayoutEffect, useRef, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_CACHING } from "metabase/plugins";
import type { TabsValue } from "metabase/ui";
import { Flex, Tabs } from "metabase/ui";

import { PerformanceTabId } from "../types";
import { getPerformanceTabName } from "../utils";

import { ModelPersistenceConfiguration } from "./ModelPersistenceConfiguration";
import P from "./PerformanceApp.module.css";
import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

const validTabIds = new Set(Object.values(PerformanceTabId).map(String));
const isValidTabId = (tab: TabsValue): tab is PerformanceTabId =>
  !!tab && validTabIds.has(tab);

export const PerformanceApp = ({
  tabId = PerformanceTabId.Databases,
  route,
}: {
  tabId: PerformanceTabId;
  route: Route;
}) => {
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

  const dispatch = useDispatch();

  return (
    <Tabs
      value={tabId}
      onChange={value => {
        if (isValidTabId(value)) {
          dispatch(
            push(
              `/admin/performance/${
                value === PerformanceTabId.Databases ? "" : value
              }`,
            ),
          );
        } else {
          console.error("Invalid tab value", value);
        }
      }}
      style={{ height: tabsHeight, display: "flex", flexDirection: "column" }}
      ref={tabsRef}
      bg="var(--mb-color-bg-light)"
    >
      <Tabs.List className={P.TabsList}>
        <Tabs.Tab
          className={P.Tab}
          key={PerformanceTabId.Databases}
          value={PerformanceTabId.Databases}
        >
          {getPerformanceTabName(PerformanceTabId.Databases)}
        </Tabs.Tab>
        <PLUGIN_CACHING.DashboardAndQuestionCachingTab />
        <Tabs.Tab
          className={P.Tab}
          key={PerformanceTabId.Models}
          value={PerformanceTabId.Models}
        >
          {getPerformanceTabName(PerformanceTabId.Models)}
        </Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel
        key={tabId}
        value={tabId}
        className={classNames(P.TabsPanel, {
          [P.hideOverflow]: [
            PerformanceTabId.Databases,
            PerformanceTabId.DashboardsAndQuestions,
          ].includes(tabId),
        })}
      >
        {tabId === PerformanceTabId.Databases && (
          <Flex className={classNames(P.TabBody, P.DatabasesTabBody)}>
            <StrategyEditorForDatabases route={route} />
          </Flex>
        )}
        {tabId === PerformanceTabId.DashboardsAndQuestions && (
          <Flex className={classNames(P.TabBody, P.hideOverflow)}>
            <PLUGIN_CACHING.StrategyEditorForQuestionsAndDashboards
              route={route}
            />
          </Flex>
        )}
        {tabId === PerformanceTabId.Models && (
          <Flex
            className={classNames(
              P.TabBody,
              P.ModelPersistenceConfigurationTabBody,
            )}
          >
            <ModelPersistenceConfiguration />
          </Flex>
        )}
      </Tabs.Panel>
    </Tabs>
  );
};
