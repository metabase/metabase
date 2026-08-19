import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";

export type MonitorHeaderTab = PillTab;

type MonitorHeaderTabsProps = {
  tabs: MonitorHeaderTab[];
};

export function MonitorHeaderTabs({ tabs }: MonitorHeaderTabsProps) {
  return <PillTabNavigation tabs={tabs} />;
}
