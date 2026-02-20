import type { Row } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { useListTransformJobTransformsQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import * as Urls from "metabase/lib/urls";
import { useNavigation } from "metabase/routing/compat";
import { Card, TreeTable, useTreeTableInstance } from "metabase/ui";
import type { Transform, TransformJobId } from "metabase-types/api";

import { ListEmptyState } from "../../ListEmptyState";
import { TitleSection } from "../../TitleSection";

import { getColumns } from "./utils";

type TransformsSectionProps = {
  jobId: TransformJobId;
};

export function TransformsSection({ jobId }: TransformsSectionProps) {
  const {
    data: transforms = [],
    error,
    isLoading,
  } = useListTransformJobTransformsQuery(jobId);

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
        <TransformTable transforms={transforms} />
      )}
    </TitleSection>
  );
}

type TransformTableProps = {
  transforms: Transform[];
};

export function TransformTable({ transforms }: TransformTableProps) {
  const columns = useMemo(() => getColumns(), []);
  const { push } = useNavigation();

  const handleRowActivate = useCallback(
    (row: Row<Transform>) => {
      push(Urls.transform(row.original.id));
    },
    [push],
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
