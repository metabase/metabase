import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useListTransformDependenciesQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TitleSection } from "../../../components/TitleSection";
import { TransformTable } from "../../../components/TransformTable";

export function DependenciesSection({ transform }: { transform: Transform }) {
  const {
    data: transforms = [],
    error,
    isLoading,
  } = useListTransformDependenciesQuery(transform.id);

  if (isLoading || transforms.length === 0) {
    return null;
  }

  return (
    <TitleSection
      label={t`Dependencies`}
      description={t`This transform depends on the output of the transforms below, so they need to be run first.`}
    >
      {error != null ? (
        <LoadingAndErrorWrapper error={error} />
      ) : (
        <TransformTable transforms={transforms} />
      )}
    </TitleSection>
  );
}
