import { useState } from "react";

import { skipToken } from "metabase/api";
import { BenchPaneHeader } from "metabase/bench/components/BenchPaneHeader";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Flex } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformTabs } from "../../components/TransformTabs";
import { POLLING_INTERVAL } from "../../constants";
import { isTransformCanceling, isTransformRunning } from "../../utils";

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
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <Flex direction="column" h="100%">
      <BenchPaneHeader
        title={<TransformTabs transform={transform} />}
        withBorder
      />
      <Flex
        direction="column"
        align="center"
        flex={1}
        pt="3.5rem"
        bg="bg-light"
      >
        <RunSection transform={transform} />
      </Flex>
    </Flex>
  );
}

function isPollingNeeded(transform?: Transform) {
  return (
    transform != null &&
    (isTransformRunning(transform) || isTransformCanceling(transform))
  );
}
