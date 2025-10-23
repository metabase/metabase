import { useState, useMemo } from "react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { ResizeHandle } from "metabase/bench/components/BenchApp";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { Box, Card, Stack } from "metabase/ui";
import { useGetTransformQuery } from "metabase-enterprise/api";
import {
  type EditorTab,
  EditorHeader,
} from "metabase-enterprise/transforms/components/QueryEditor/EditorHeader";
import { getValidationResult } from "metabase-enterprise/transforms/components/QueryEditor/utils";
import { useSourceState } from "metabase-enterprise/transforms/hooks/use-source-state";
import {
  type TransformEditorValue,
  useTransformEditor,
} from "metabase-enterprise/transforms/hooks/use-transform-editor";
import type { Transform, TransformId } from "metabase-types/api";

import { POLLING_INTERVAL } from "../../constants";
import {
  TransformQueryPage,
  useTransformQueryPageHandlers,
} from "../TransformQueryPage";

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

  const transformEditor = useTransformEditor(transform.source, proposedSource);
  const [selectedTab, setSelectedTab] = useState<EditorTab>("preview");

  const handlers = useTransformQueryPageHandlers({
    transform,
    setSource,
    clearProposed,
  });

  const validationResult = useMemo(
    () => getValidationResult(transformEditor.question.query()),
    [transformEditor.question],
  );

  const isNew = !transform.id;

  const renderTabContent = () => {
    switch (selectedTab) {
      case "preview":
        return (
          <Box
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <TransformQueryPage
              transform={transform}
              setSource={setSource}
              proposedSource={proposedSource}
              acceptProposed={acceptProposed}
              clearProposed={clearProposed}
              transformEditor={transformEditor}
              onSave={handlers.handleSaveSource}
              onCancel={handlers.handleCancel}
              isSaving={handlers.isSaving}
            />
            <Box style={{ flex: 1, overflow: "hidden", display: "flex" }}>
              <QueryPreview transformEditor={transformEditor} />
            </Box>
          </Box>
        );
      case "run":
        return (
          <Box p="md" style={{ overflow: "auto", height: "100%" }}>
            <RunSection transform={transform} />
          </Box>
        );
      case "target":
        return (
          <Box p="md" style={{ overflow: "auto", height: "100%" }}>
            <TargetSection transform={transform} />
          </Box>
        );
      case "dependencies":
        return (
          <Box p="md" style={{ overflow: "auto", height: "100%" }}>
            <DependenciesSection transform={transform} />
          </Box>
        );
    }
  };

  return (
    <Stack gap={0} h="100%" w="100%">
      <EditorHeader
        validationResult={validationResult}
        isNew={isNew}
        isQueryDirty={transformEditor.isQueryDirty}
        isSaving={handlers.isSaving}
        hasProposedQuery={!!proposedSource}
        onSave={() => {
          const source = proposedSource ?? {
            type: "query" as const,
            query: transformEditor.question.datasetQuery(),
          };
          void handlers.handleSaveSource(source);
        }}
        onCancel={handlers.handleCancel}
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
      />
      {renderTabContent()}
    </Stack>
  );
};

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
