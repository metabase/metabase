import { useState } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import type { Transform, TransformId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";
import { TransformQueryPage } from "../TransformQueryPage";

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
    <PanelGroup direction="horizontal">
      <Panel>
        <TransformQueryPage transform={transform} />
      </Panel>
      <ResizeHandle />
      <Panel>
        <Stack gap="md" data-testid="transform-page">
          <Stack gap="sm">
            <HeaderSection transform={transform} />
            <NameSection transform={transform} />
          </Stack>
          <RunSection transform={transform} />
          <TargetSection transform={transform} />
          <DependenciesSection transform={transform} />
        </Stack>
      </Panel>
    </PanelGroup>
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
