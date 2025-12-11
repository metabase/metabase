import { EntityDetailTabs } from "metabase-enterprise/data-studio/common/components/EntityDetailTabs/EntityDetailTabs";
import type { SegmentTabUrls } from "metabase-enterprise/data-studio/segments/layouts/SegmentLayout";

type SegmentTabsProps = {
  urls: SegmentTabUrls;
};

export function SegmentTabs({ urls }: SegmentTabsProps) {
  return <EntityDetailTabs urls={urls} />;
}
