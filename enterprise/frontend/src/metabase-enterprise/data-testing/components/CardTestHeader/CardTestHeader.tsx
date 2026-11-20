import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";
import { DataStudioMetricBreadcrumbs } from "metabase-enterprise/data-studio/library/metrics/components/DataStudioMetricBreadcrumbs";
import type { Card, CardTest, DataTestRun } from "metabase-types/api";

import {
  DataTestRunTitle,
  getDataTestRunBreadcrumbs,
} from "../DataTestRunTitle";

type CardTestHeaderProps = {
  card: Card;
  test: CardTest;
  run?: DataTestRun;
};

function isRunsPathname(pathname: string) {
  return pathname.endsWith("/runs");
}

export function CardTestHeader({ card, test, run }: CardTestHeaderProps) {
  const overviewUrl = Urls.dataStudioMetricTest(card.id, test.id);
  const runsUrl = Urls.dataStudioMetricTestRuns(card.id, test.id);
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: overviewUrl,
      isSelected: (pathname: string) => !isRunsPathname(pathname),
    },
    {
      label: t`Runs`,
      to: runsUrl,
      isSelected: isRunsPathname,
    },
  ];

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
        <DataStudioMetricBreadcrumbs card={card}>
          <Link to={Urls.dataStudioMetricTestList(card.id)}>{card.name}</Link>
          {run != null
            ? getDataTestRunBreadcrumbs({
                testName: test.name,
                testUrl: overviewUrl,
                runsUrl,
                run,
              })
            : test.name}
        </DataStudioMetricBreadcrumbs>
      }
      data-testid="card-test-header"
    />
  );
}
