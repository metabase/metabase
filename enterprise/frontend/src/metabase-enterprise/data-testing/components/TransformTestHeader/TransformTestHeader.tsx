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
import * as Urls from "metabase/urls";
import type { Transform, TransformTest } from "metabase-types/api";

type TransformTestHeaderProps = {
  transform: Transform;
  test: TransformTest;
};

export function TransformTestHeader({
  transform,
  test,
}: TransformTestHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: transform.collection_id,
    namespace: "transforms",
  });

  const runsUrl = Urls.transformTestRuns(transform.id, test.id);
  const tabs: PillTab[] = [
    {
      label: t`Overview`,
      to: Urls.transformTest(transform.id, test.id),
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
          <Link to={Urls.transformList()}>{t`Data transformation`}</Link>
          {path?.map((folder) => (
            <Link
              key={folder.id}
              to={`${Urls.transformList()}?collectionId=${folder.id}`}
            >
              {folder.name}
            </Link>
          ))}
          <Link to={Urls.transformTestList(transform.id)}>
            {transform.name}
          </Link>
          {test.name}
        </DataStudioBreadcrumbs>
      }
      data-testid="transform-test-header"
    />
  );
}
