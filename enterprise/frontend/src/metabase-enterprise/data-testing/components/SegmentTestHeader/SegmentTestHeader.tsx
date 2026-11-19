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
import type {
  DataTestRun,
  Segment,
  SegmentTest,
  Table,
} from "metabase-types/api";

import type { SegmentTestUrls } from "../../hooks/use-segment-test-urls";
import {
  DataTestRunTitle,
  getDataTestRunBreadcrumbs,
} from "../DataTestRunTitle";

type SegmentTestHeaderProps = {
  segment: Segment;
  table: Table;
  test: SegmentTest;
  urls: SegmentTestUrls;
  run?: DataTestRun;
};

function isRunsPathname(pathname: string) {
  return pathname.endsWith("/runs");
}

export function SegmentTestHeader({
  segment,
  table,
  test,
  urls,
  run,
}: SegmentTestHeaderProps) {
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: urls.getTestUrl(segment.id, test.id),
      isSelected: (pathname: string) => !isRunsPathname(pathname),
    },
    {
      label: t`Runs`,
      to: urls.getTestRunsUrl(segment.id, test.id),
      isSelected: isRunsPathname,
    },
  ];
  const Breadcrumbs =
    urls.location === "data-model"
      ? DataModelBreadcrumbs
      : PublishedTableBreadcrumbs;

  return (
    <PaneHeader
      title={
        <PanelHeaderTitle>
          {run != null ? <DataTestRunTitle run={run} /> : test.name}
        </PanelHeaderTitle>
      }
      icon="test_tube"
      tabs={run == null ? <PillTabNavigation tabs={tabs} /> : undefined}
      breadcrumbs={
        <Breadcrumbs
          table={table}
          entityName={segment.name}
          newEntityLabel={t`New segment`}
          tableListUrl={urls.segmentListUrl}
          entityUrl={urls.getTestListUrl(segment.id)}
          entityChildName={test.name}
        >
          {run != null &&
            getDataTestRunBreadcrumbs({
              testName: test.name,
              testUrl: urls.getTestUrl(segment.id, test.id),
              runsUrl: urls.getTestRunsUrl(segment.id, test.id),
              run,
            })}
        </Breadcrumbs>
      }
      data-testid="segment-test-header"
    />
  );
}
