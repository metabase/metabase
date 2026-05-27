import cx from "classnames";
import { t } from "ttag";

import type {
  ExplorationNavigation,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { Tabs } from "metabase/ui";

import { NewExplorationChat } from "../NewExplorationChat";

import { NewExplorationBrowse } from "./NewExplorationBrowse";
import S from "./NewExplorationLeftTabs.module.css";

export interface NewExplorationLeftTabsProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
}

/**
 * Left half of `/question/research`. Wraps the existing chat editor +
 * the new manual-picker (Browse) into a single two-tab container so
 * users can switch between agent-driven and manual flows without losing
 * the right-panel pills (both feed the same `selection` state). The
 * outer tab is controlled by `navigation` so the right pane's "+"
 * buttons can switch to Browse.
 */
export function NewExplorationLeftTabs({
  selection,
  navigation,
}: NewExplorationLeftTabsProps) {
  return (
    <Tabs
      value={navigation.leftTab}
      onChange={(value) => {
        if (value === "chat" || value === "browse") {
          navigation.setLeftTab(value);
        }
      }}
      classNames={{ root: S.tabsRoot }}
      keepMounted={false}
    >
      <Tabs.List className={cx(S.tabList, S.topTabList)}>
        <Tabs.Tab value="chat">{t`Chat`}</Tabs.Tab>
        <Tabs.Tab value="browse">{t`Add data`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="chat" className={S.tabPanel}>
        <NewExplorationChat selection={selection} />
      </Tabs.Panel>
      <Tabs.Panel value="browse" className={S.tabPanel}>
        <NewExplorationBrowse selection={selection} navigation={navigation} />
      </Tabs.Panel>
    </Tabs>
  );
}
