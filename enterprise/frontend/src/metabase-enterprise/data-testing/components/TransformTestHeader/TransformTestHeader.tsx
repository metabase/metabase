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
import type { DataTestRun, Transform, TransformTest } from "metabase-types/api";

import {
  DataTestRunTitle,
  getDataTestRunBreadcrumbs,
} from "../DataTestRunTitle";

type TransformTestHeaderProps = {
  transform: Transform;
  test: TransformTest;
  run?: DataTestRun;
};

export function TransformTestHeader({
  transform,
  test,
  run,
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
      title={
        <PanelHeaderTitle>
          {run != null ? <DataTestRunTitle run={run} /> : test.name}
        </PanelHeaderTitle>
      }
      icon="test_tube"
      tabs={run == null ? <PillTabNavigation tabs={tabs} /> : undefined}
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
          {run != null
            ? getDataTestRunBreadcrumbs({
                testName: test.name,
                testUrl: Urls.transformTest(transform.id, test.id),
                runsUrl,
                run,
              })
            : test.name}
        </DataStudioBreadcrumbs>
      }
      data-testid="transform-test-header"
    />
  );
}
