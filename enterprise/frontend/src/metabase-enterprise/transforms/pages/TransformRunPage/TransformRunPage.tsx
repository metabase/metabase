import { useState } from "react";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Box, Center } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { ColumnLayout } from "../../components/ColumnLayout";
import { TransformHeader } from "../../components/TransformHeader";
import { POLLING_INTERVAL } from "../../constants";
import {
  isTransformCanceling,
  isTransformRunning,
  isTransformSyncing,
} from "../../utils";

import { RunSection } from "./RunSection";

type TransformRunPageParams = {
  transformId: string;
};

type TransformRunPageProps = {
  params: TransformRunPageParams;
};

export function TransformRunPage({ params }: TransformRunPageProps) {
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
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <ColumnLayout data-testid="transforms-run-content" px="3.5rem">
      <TransformHeader transform={transform} />
      <Box pt="1.5rem">
        <RunSection transform={transform} />
      </Box>
    </ColumnLayout>
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
