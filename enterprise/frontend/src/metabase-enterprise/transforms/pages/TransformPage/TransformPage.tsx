import { useState } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Box, Card, Tabs } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import {
  type TransformEditorValue,
  useQueryEditor,
} from "metabase-enterprise/transforms/hooks/use-query-editor";
import { useSourceState } from "metabase-enterprise/transforms/hooks/use-source-state";
import type { Transform, TransformId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";
import { TransformQueryPage } from "../TransformQueryPage";

import { DependenciesSection } from "./DependenciesSection";
import { QueryPreview } from "./QueryPreview";
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
    isFetching,
    error,
  } = useGetTransformQuery(transformId ?? skipToken, {
    pollingInterval: isPolling ? POLLING_INTERVAL : undefined,
  });

  if (isPolling !== isPollingNeeded(transform)) {
    setIsPolling(isPollingNeeded(transform));
  }

  if (isLoading || isFetching || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Not found.`} />;
  }

  return <TransformPageInner transform={transform} />;
}

const TransformPageInner = ({ transform }: { transform: Transform }) => {
  const { setSource, proposedSource, acceptProposed, clearProposed } =
    useSourceState(transform.id, transform.source);

  // TODO: handle python transforms
  const queryEditor = useQueryEditor(
    transform.source.query,
    proposedSource?.query,
  );

  return (
    <PanelGroup
      autoSaveId="transforms-editor-panel-layout"
      direction="vertical"
      style={{ height: "100%", width: "100%" }}
    >
      <Panel>
        <TransformQueryPage
          transform={transform}
          setSource={setSource}
          proposedSource={proposedSource}
          acceptProposed={acceptProposed}
          clearProposed={clearProposed}
          queryEditor={queryEditor}
        />
      </Panel>
      <ResizeHandle direction="vertical" />
      <Panel minSize={5} style={{ backgroundColor: "transparent" }}>
        <TransformDrawer transform={transform} queryEditor={queryEditor} />
      </Panel>
    </PanelGroup>
  );
};

export function TransformDrawer({
  transform,
  queryEditor,
}: {
  transform: Transform;
  queryEditor: TransformEditorValue;
}) {
  const isNew = !transform.id;

  return (
    <Card withBorder mx="sm" h="100%">
      <Tabs defaultValue="preview" variant="pills">
        <Tabs.List>
          <Tabs.Tab name={t`Preview`} value="preview">{t`Preview`}</Tabs.Tab>
          {!isNew && (
            <>
              <Tabs.Tab name={t`Run`} value="run">{t`Run`}</Tabs.Tab>
              <Tabs.Tab name={t`Target`} value="target">{t`Target`}</Tabs.Tab>
              <Tabs.Tab
                name={t`Dependencies`}
                value="dependencies"
              >{t`Dependencies`}</Tabs.Tab>
            </>
          )}
        </Tabs.List>
        <Box p="md">
          <Tabs.Panel value="preview">
            <QueryPreview queryEditor={queryEditor} />
          </Tabs.Panel>
          {!isNew && (
            <>
              <Tabs.Panel value="run">
                <RunSection transform={transform} />
              </Tabs.Panel>
              <Tabs.Panel value="target">
                <TargetSection transform={transform} />
              </Tabs.Panel>
              <Tabs.Panel value="dependencies">
                <DependenciesSection transform={transform} />
              </Tabs.Panel>
            </>
          )}
        </Box>
      </Tabs>
    </Card>
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
