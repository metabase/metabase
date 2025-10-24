import { useState } from "react";

import { skipToken } from "metabase/api";
import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformTabs } from "../../components/TransformTabs";
import { POLLING_INTERVAL } from "../../constants";
import {
  isTransformCanceling,
  isTransformRunning,
  isTransformSyncing,
} from "../../utils";

import { TargetSection } from "./TargetSection";

type TransformTargetPageParams = {
  transformId: string;
};

type TransformTargetPageProps = {
  params: TransformTargetPageParams;
};

export function TransformTargetPage({ params }: TransformTargetPageProps) {
  const [isPolling, setIsPolling] = useState(false);
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(transform)) {
    setIsPolling(isPollingNeeded(transform));
  }

  if (isLoading || error || transform == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <div>
      <BenchPaneHeader title={<TransformTabs transform={transform} />} />
      <TargetSection transform={transform} />
    </div>
  );
}

function isPollingNeeded(transform?: Transform) {
  return (
    transform != null &&
    (isTransformRunning(transform) ||
      isTransformCanceling(transform) ||
      isTransformSyncing(transform))
  );
}
