import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { parseLocalTimestamp } from "metabase-enterprise/transforms/utils";
import type { Transform, TransformId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";

import { HeaderSection } from "./HeaderSection";
import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { RunSection } from "./RunSection";
import { TargetSection } from "./TargetSection";

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
  const [isPolling, setIsPolling] = useState(false);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(transform)) {
    setIsPolling(!isPolling);
  }

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  return (
    <Stack gap="3.5rem">
      <Stack gap="lg">
        <HeaderSection transform={transform} />
        <NameSection transform={transform} />
      </Stack>
      <RunSection transform={transform} />
      <TargetSection transform={transform} />
      <ManageSection transform={transform} />
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

export function isPollingNeeded(transform?: Transform) {
  if (transform == null) {
    return false;
  }

  const { last_run, updated_at, table } = transform;
  if (last_run == null) {
    return false;
  }

  const { status, end_time } = last_run;
  if (status === "started") {
    return true;
  }

  // If the transform has succeeded but there is no table yet, the sync might be
  // still running. In this case continue polling, but only if the transform has
  // not been updated since the last run. It prevents infinite polling for a
  // case where a target gets deleted for a previously succeeded transform.
  if (status === "succeeded") {
    return (
      table == null &&
      end_time != null &&
      parseLocalTimestamp(end_time).isAfter(parseLocalTimestamp(updated_at))
    );
  }

  return false;
}
