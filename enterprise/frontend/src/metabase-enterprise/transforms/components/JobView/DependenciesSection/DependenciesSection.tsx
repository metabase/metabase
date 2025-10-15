import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useListTransformJobTransformsQuery } from "metabase-enterprise/api";
import type { TransformJobId } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { TransformTable } from "../../../components/TransformTable";
import { ListEmptyState } from "../../ListEmptyState";

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
        <ListEmptyState label={t`There are no transforms for this job.`} />
      ) : (
        <TransformTable transforms={transforms} />
      )}
    </TitleSection>
  );
}
