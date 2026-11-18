import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { getLibraryCollectionDisplayName } from "metabase/data-studio/common/utils";
import * as Urls from "metabase/urls";
import type { Card, CardTest } from "metabase-types/api";

type CardTestHeaderProps = {
  card: Card;
  test: CardTest;
};

export function CardTestHeader({ card, test }: CardTestHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: card.collection_id,
  });

  const runsUrl = Urls.dataStudioMetricTestRuns(card.id, test.id);
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioMetricTest(card.id, test.id),
    },
    {
      label: t`Runs`,
      to: runsUrl,
      isSelected: (pathname: string) => pathname.startsWith(runsUrl),
    },
  ];

  return (
    <PaneHeader
      title={<PanelHeaderTitle>{test.name}</PanelHeaderTitle>}
      icon="test_tube"
      tabs={<PillTabNavigation tabs={tabs} />}
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          {path?.map((collection, index) => (
            <Link
              key={collection.id}
              to={Urls.dataStudioLibrary({
                expandedIds: path.slice(1, index + 1).map(({ id }) => id),
              })}
            >
              {getLibraryCollectionDisplayName(collection)}
            </Link>
          ))}
          <Link to={Urls.dataStudioMetricTestList(card.id)}>{card.name}</Link>
          {test.name}
        </DataStudioBreadcrumbs>
      }
      data-testid="card-test-header"
    />
  );
}
