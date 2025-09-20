import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";

import { DependenciesSection } from "./DependenciesSection";
import { HeaderSection } from "./HeaderSection";
import { ManageSection } from "./ManageSection";
import { NameSection } from "./NameSection";
import { RunSection } from "./RunSection";
import { TargetSection } from "./TargetSection";
import {
  isTransformCanceling,
  isTransformRunning,
  isTransformSyncing,
} from "./utils";

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
    setIsPolling(isPollingNeeded(transform));
  }

  useRegisterMetabotContextProvider(async () => {
    return transform
      ? { user_is_viewing: [{ type: "transform", ...transform }] }
      : {};
  }, [transform]);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  return (
    <Stack gap="3.5rem" data-testid="transform-page">
      <Stack gap="lg">
        <HeaderSection transform={transform} />
        <NameSection transform={transform} />
      </Stack>
      <RunSection transform={transform} />
      <TargetSection transform={transform} />
      <ManageSection transform={transform} />
      <DependenciesSection transform={transform} />
    </Stack>
  );
}

function getParsedParams({
  transformId,
}: TransformPageParams): TransformPageParsedParams {
  return {
    transformId: Urls.extractEntityId(transformId),
  };
}

function isPollingNeeded(transform?: Transform) {
  return (
    transform != null &&
    (isTransformRunning(transform) ||
      isTransformSyncing(transform) ||
      isTransformCanceling(transform))
  );
}
