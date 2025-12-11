import { EntityDetailTabs } from "metabase-enterprise/data-studio/common/components/EntityDetailTabs/EntityDetailTabs";
import type { MeasureTabUrls } from "metabase-enterprise/data-studio/measures/layouts/MeasureLayout";

type MeasureTabsProps = {
  urls: MeasureTabUrls;
};

export function MeasureTabs({ urls }: MeasureTabsProps) {
  return <EntityDetailTabs urls={urls} />;
}
