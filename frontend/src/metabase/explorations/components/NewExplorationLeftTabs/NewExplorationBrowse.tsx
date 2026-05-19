import { useState } from "react";
import { t } from "ttag";

import type { ExplorationSelection } from "metabase/explorations/hooks";
import { Tabs } from "metabase/ui";

import { BrowseDimensionsPanel } from "./BrowseDimensionsPanel";
import { BrowseMetricsPanel } from "./BrowseMetricsPanel";
import { BrowseTimelinesPanel } from "./BrowseTimelinesPanel";
import S from "./NewExplorationLeftTabs.module.css";

type BrowseTab = "metrics" | "dimensions" | "timelines";

export interface NewExplorationBrowseProps {
  selection: ExplorationSelection;
}

/**
 * Inner-tabs container for the Browse panel: Metrics, Dimensions,
 * Timelines. Each sub-panel renders its own search input + virtualized
 * list and commits to `selection` on every checkbox click.
 */
export function NewExplorationBrowse({ selection }: NewExplorationBrowseProps) {
  const [activeTab, setActiveTab] = useState<BrowseTab>("metrics");

  return (
    <Tabs
      variant="pills"
      value={activeTab}
      onChange={(value) => {
        if (
          value === "metrics" ||
          value === "dimensions" ||
          value === "timelines"
        ) {
          setActiveTab(value);
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
        <BrowseMetricsPanel selection={selection} />
      </Tabs.Panel>
      <Tabs.Panel value="dimensions" className={S.tabPanel}>
        <BrowseDimensionsPanel selection={selection} />
      </Tabs.Panel>
      <Tabs.Panel value="timelines" className={S.tabPanel}>
        <BrowseTimelinesPanel selection={selection} />
      </Tabs.Panel>
    </Tabs>
  );
}
