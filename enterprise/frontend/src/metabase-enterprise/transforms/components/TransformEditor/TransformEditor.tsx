import { useListDatabasesQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Center, Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { QueryTransformSource, TransformId } from "metabase-types/api";

import { TransformHeaderView } from "../TransformHeader";

import { QuerySection } from "./QuerySection";
import { SaveSection } from "./SaveSection";
import S from "./TransformEditor.module.css";
import { VisualizationSection } from "./VisualizationSection";
import { useQueryMetadata } from "./use-query-metadata";
import { useQueryResults } from "./use-query-results";
import { useSourceQuery } from "./use-source-query";

type TransformEditorProps = {
  id?: TransformId;
  name: string;
  source: QueryTransformSource;
  isSaving: boolean;
  isSourceDirty: boolean;
  onNameChange: (newName: string) => void;
  onSourceChange: (newSource: QueryTransformSource) => void;
  onSave: () => void;
  onCancel: () => void;
};

export function TransformEditor({
  id,
  name,
  source,
  isSaving,
  isSourceDirty,
  onNameChange,
  onSourceChange,
  onSave,
  onCancel,
}: TransformEditorProps) {
  const { question, setQuestion } = useSourceQuery(source, onSourceChange);
  const { isMetadataLoading, metadataError } = useQueryMetadata(question);
  const {
    result,
    rawSeries,
    isRunnable,
    isRunning,
    isResultDirty,
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
      <TransformHeaderView
        id={id}
        name={name}
        actions={
          (isSaving || isSourceDirty) && (
            <SaveSection
              isSaving={isSaving}
              onSave={onSave}
              onCancel={onCancel}
            />
          )
        }
        onNameChange={onNameChange}
      />
      <Flex className={S.body} direction="column">
        <QuerySection
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
        <VisualizationSection
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
