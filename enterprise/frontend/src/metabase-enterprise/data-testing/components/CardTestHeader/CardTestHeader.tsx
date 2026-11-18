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
import type { Card, CardTest } from "metabase-types/api";

type CardTestHeaderProps = {
  card: Card;
  test: CardTest;
};

function isRunsPathname(pathname: string) {
  return pathname.endsWith("/runs");
}

export function CardTestHeader({ card, test }: CardTestHeaderProps) {
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
      title={<PanelHeaderTitle>{test.name}</PanelHeaderTitle>}
      icon="test_tube"
      tabs={<PillTabNavigation tabs={tabs} />}
      breadcrumbs={
        <DataStudioMetricBreadcrumbs card={card}>
          <Link to={Urls.dataStudioMetricTestList(card.id)}>{card.name}</Link>
          {test.name}
        </DataStudioMetricBreadcrumbs>
      }
      data-testid="card-test-header"
    />
  );
}
