import { t } from "ttag";

import type {
  ExplorationNavigation,
  ExplorationSelection,
} from "metabase/explorations/hooks";
import { Tabs } from "metabase/ui";

import { BrowseDimensionsPanel } from "./BrowseDimensionsPanel";
import { BrowseMetricsPanel } from "./BrowseMetricsPanel";
import { BrowseTimelinesPanel } from "./BrowseTimelinesPanel";
import S from "./NewExplorationLeftTabs.module.css";

export interface NewExplorationDataTabsProps {
  selection: ExplorationSelection;
  navigation: ExplorationNavigation;
}

export function NewExplorationDataTabs({
  selection,
  navigation,
}: NewExplorationDataTabsProps) {
  return (
    <Tabs
      variant="pills"
      value={navigation.browseTab}
      onChange={(value) => {
        if (
          value === "metrics" ||
          value === "dimensions" ||
          value === "timelines"
        ) {
          navigation.setBrowseTab(value);
        }
      }}
      classNames={{ root: S.tabsRoot }}
      keepMounted={false}
    >
      <Tabs.List className={S.tabList}>
        <Tabs.Tab value="metrics">{t`Metrics`}</Tabs.Tab>
        <Tabs.Tab value="dimensions">{t`Dimensions`}</Tabs.Tab>
        <Tabs.Tab value="timelines">{t`Timelines`}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="metrics" className={S.tabPanel}>
        <BrowseMetricsPanel selection={selection} navigation={navigation} />
      </Tabs.Panel>
      <Tabs.Panel value="dimensions" className={S.tabPanel}>
        <BrowseDimensionsPanel selection={selection} navigation={navigation} />
      </Tabs.Panel>
      <Tabs.Panel value="timelines" className={S.tabPanel}>
        <BrowseTimelinesPanel selection={selection} />
      </Tabs.Panel>
    </Tabs>
  );
}
