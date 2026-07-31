import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListTransformJobTransformsQuery } from "metabase/api";
import { ListEmptyState } from "metabase/common/components/ListEmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import CS from "metabase/css/core/index.css";
import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Transform,
  TransformJobId,
  TransformRun,
} from "metabase-types/api";

import type { TransformRunByTransformId } from "./types";
import { useJobRunTransformRuns } from "./use-job-run-transform-runs";
import { getColumns } from "./utils";

type TransformsSectionProps = {
  jobId: TransformJobId;
  lastJobRun?: TransformRun | null;
};

export function TransformsSection({
  jobId,
  lastJobRun,
}: TransformsSectionProps) {
  const {
    data: transforms = [],
    error,
    isLoading,
  } = useListTransformJobTransformsQuery(jobId);
  const transformRunByTransformId = useJobRunTransformRuns(jobId, lastJobRun);

  return (
    <TitleSection
      label={t`Transforms`}
      description={t`Transforms will be run in this order.`}
    >
      {isLoading || error != null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : transforms.length === 0 ? (
        <Card shadow="none">
          <ListEmptyState label={t`There are no transforms for this job.`} />
        </Card>
      ) : (
        <TransformTable
          transforms={transforms}
          transformRunByTransformId={transformRunByTransformId}
        />
      )}
    </TitleSection>
  );
}

type TransformTableProps = {
  transforms: Transform[];
  transformRunByTransformId: TransformRunByTransformId;
};

export function TransformTable({
  transforms,
  transformRunByTransformId,
}: TransformTableProps) {
  const columns = useMemo(
    () => getColumns(transformRunByTransformId),
    [transformRunByTransformId],
  );
  const dispatch = useDispatch();

  const handleRowActivate = useCallback(
    (row: Row<Transform>) => {
      dispatch(push(Urls.transform(row.original.id)));
    },
    [dispatch],
  );

  const treeTableInstance = useTreeTableInstance<Transform>({
    data: transforms,
    columns,
    getNodeId: (transform) => String(transform.id),
    onRowActivate: handleRowActivate,
  });

  return (
    <Card
      className={CS.overflowHidden}
      p={0}
      flex="0 1 auto"
      mih={0}
      shadow="none"
      withBorder
    >
      <TreeTable
        instance={treeTableInstance}
        emptyState={
          <ListEmptyState label={t`There are no transforms for this job.`} />
        }
        ariaLabel={t`Job transforms`}
        onRowClick={handleRowActivate}
      />
    </Card>
  );
}
