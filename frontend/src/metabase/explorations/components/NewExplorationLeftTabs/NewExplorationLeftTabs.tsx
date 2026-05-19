import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import type { ExplorationSelection } from "metabase/explorations/hooks";
import { Tabs } from "metabase/ui";

import { NewExplorationChat } from "../NewExplorationChat";

import { NewExplorationBrowse } from "./NewExplorationBrowse";
import S from "./NewExplorationLeftTabs.module.css";

type LeftTab = "chat" | "browse";

export interface NewExplorationLeftTabsProps {
  selection: ExplorationSelection;
}

/**
 * Left half of `/question/research`. Wraps the existing chat editor +
 * the new manual-picker (Browse) into a single two-tab container so
 * users can switch between agent-driven and manual flows without losing
 * the right-panel pills (both feed the same `selection` state).
 */
export function NewExplorationLeftTabs({
  selection,
}: NewExplorationLeftTabsProps) {
  const [activeTab, setActiveTab] = useState<LeftTab>("chat");

  return (
    <Tabs
      value={activeTab}
      onChange={(value) => {
        if (value === "chat" || value === "browse") {
          setActiveTab(value);
        }
      }}
      classNames={{ root: S.tabsRoot }}
      keepMounted={false}
    >
      <Tabs.List className={cx(S.tabList, S.topTabList)}>
        <Tabs.Tab value="chat">{t`Chat`}</Tabs.Tab>
        <Tabs.Tab value="browse">{t`Browse`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="chat" className={S.tabPanel}>
        <NewExplorationChat
          setMetrics={selection.setMetrics}
          setDimensions={selection.setDimensions}
          setName={selection.setName}
        />
      </Tabs.Panel>
      <Tabs.Panel value="browse" className={S.tabPanel}>
        <NewExplorationBrowse selection={selection} />
      </Tabs.Panel>
    </Tabs>
  );
}
