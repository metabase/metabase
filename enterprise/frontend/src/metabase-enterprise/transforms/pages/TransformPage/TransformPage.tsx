import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { TransformId } from "metabase-types/api";

import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { ScheduleSection } from "./ScheduleSection";

type TransformPageParams = {
  transformId: string;
};

type TransformPageParsedParams = {
  transformId?: TransformId;
};

type TransformPageProps = {
  params: TransformPageParams;
};

export function TransformPage({ params }: TransformPageProps) {
  const { transformId } = getParsedParams(params);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`No transform found.`} />;
  }

  return (
    <Stack gap="5rem">
      <NameSection transform={transform} />
      <ManageSection transform={transform} />
      <ScheduleSection transform={transform} />
    </Stack>
  );
}

export function getParsedParams({
  transformId,
}: TransformPageParams): TransformPageParsedParams {
  return {
    transformId: Urls.extractEntityId(transformId),
  };
}
