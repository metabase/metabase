import { push } from "react-router-redux";
import { t } from "ttag";

import { AdminContentTable } from "metabase/common/components/AdminContentTable";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Card } from "metabase/ui";
import { useListTransformJobTransformsQuery } from "metabase-enterprise/api";
import type { Transform, TransformJobId } from "metabase-types/api";

import { ListEmptyState } from "../../ListEmptyState";
import { TitleSection } from "../../TitleSection";

import S from "./DependenciesSection.module.css";

type DependenciesSectionProps = {
  jobId: TransformJobId;
};

export function DependenciesSection({ jobId }: DependenciesSectionProps) {
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
  const dispatch = useDispatch();

  const handleRowClick = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  return (
    <AdminContentTable columnTitles={[t`Transform`, t`Target`]}>
      {transforms.map((transform) => (
        <tr
          key={transform.id}
          className={S.row}
          onClick={() => handleRowClick(transform)}
        >
          <td className={S.wrap}>{transform.name}</td>
          <td className={S.wrap}>{transform.target.name}</td>
        </tr>
      ))}
    </AdminContentTable>
  );
}
