import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TransformSource } from "metabase-types/api";

import type { TransformInfo } from "../../types";
import { TransformHeaderView } from "../TransformHeader";

import { EditorBody } from "./EditorBody";
import { EditorVisualization } from "./EditorVisualization";
import S from "./TransformEditor.module.css";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useQueryState } from "./use-query-state";

type TransformEditorProps = {
  transform: TransformInfo;
  onNameChange: (name: string) => void;
  onSourceChange: (source: TransformSource) => void;
};

export function TransformEditor({
  transform,
  onNameChange,
  onSourceChange,
}: TransformEditorProps) {
  const { question, setQuestion } = useQueryState(
    transform.source,
    onSourceChange,
  );
  const { isMetadataLoading, metadataError } = useQueryMetadata(question);
  const {
    isRunnable,
    isRunning,
    isResultDirty,
    result,
    rawSeries,
    runQuery,
    cancelQuery,
  } = useQueryResults(question);
  const {
    data: databases,
    isLoading: isDatabaseListLoading,
    error: databasesError,
  } = useListDatabasesQuery({
    include_analytics: true,
  });
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const isLoading = isMetadataLoading || isDatabaseListLoading;
  const error = metadataError ?? databasesError;

  if (isLoading || error != null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <Flex direction="column" h="100%">
      <TransformHeaderView transform={transform} onNameChange={onNameChange} />
      <Flex className={S.body}>
        <EditorBody
          question={question}
          databases={databases?.data ?? []}
          modalSnippet={undefined}
          nativeEditorSelectedText={undefined}
          isNative={isNative}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isResultDirty={isResultDirty}
          isShowingDataReference={false}
          isShowingSnippetSidebar={false}
          onChange={setQuestion}
          onRunQuery={runQuery}
          onCancelQuery={cancelQuery}
          onToggleDataReference={() => null}
          onToggleSnippetSidebar={() => null}
          onOpenModal={() => undefined}
          onChangeModalSnippet={() => undefined}
          onChangeNativeEditorSelection={() => undefined}
        />
        <EditorVisualization
          question={question}
          result={result}
          rawSeries={rawSeries}
          isNative={isNative}
          isRunnable={isRunnable}
          isRunning={isRunning}
          isResultDirty={isResultDirty}
          onRunQuery={runQuery}
          onCancelQuery={cancelQuery}
        />
      </Flex>
    </Flex>
  );
}
