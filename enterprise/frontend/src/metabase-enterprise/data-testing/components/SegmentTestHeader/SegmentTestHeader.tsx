import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { DataModelBreadcrumbs } from "metabase/data-studio/common/components/DataModelBreadcrumbs";
import { PublishedTableBreadcrumbs } from "metabase/data-studio/common/components/PublishedTableBreadcrumbs";
import type { Segment, SegmentTest, Table } from "metabase-types/api";

import type { SegmentTestUrls } from "../../hooks/use-segment-test-urls";

type SegmentTestHeaderProps = {
  segment: Segment;
  table: Table;
  test: SegmentTest;
  urls: SegmentTestUrls;
};

export function SegmentTestHeader({
  segment,
  table,
  test,
  urls,
}: SegmentTestHeaderProps) {
  const runsUrl = urls.getTestRunsUrl(segment.id, test.id);
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: urls.getTestUrl(segment.id, test.id),
    },
    {
      label: t`Runs`,
      to: runsUrl,
      isSelected: (pathname: string) => pathname.startsWith(runsUrl),
    },
  ];
  const Breadcrumbs =
    urls.location === "data-model"
      ? DataModelBreadcrumbs
      : PublishedTableBreadcrumbs;

  return (
    <PaneHeader
      title={<PanelHeaderTitle>{test.name}</PanelHeaderTitle>}
      icon="test_tube"
      tabs={<PillTabNavigation tabs={tabs} />}
      breadcrumbs={
        <Breadcrumbs
          table={table}
          entityName={segment.name}
          newEntityLabel={t`New segment`}
          tableListUrl={urls.segmentListUrl}
          entityUrl={urls.getTestListUrl(segment.id)}
          entityChildName={test.name}
        />
      }
      data-testid="segment-test-header"
    />
  );
}
