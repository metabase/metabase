import { useMemo } from "react";

import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { CodeMirrorEditor as Editor } from "metabase/query_builder/components/NativeQueryEditor/CodeMirrorEditor";
import { useQueryMetadata } from "metabase/querying/editor/hooks/use-query-metadata";
import { Notebook } from "metabase/querying/notebook/components/Notebook";
import { getMetadata } from "metabase/selectors/metadata";
import { Center, Loader } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetQuery } from "metabase-types/api";

type QueryViewProps = {
  query: DatasetQuery;
};

export function QueryView({ query }: QueryViewProps) {
  const metadata = useSelector(getMetadata);
  const question = useMemo(
    () => Question.create({ dataset_query: query, metadata }),
    [query, metadata],
  );
  const { isNative } = Lib.queryDisplayInfo(question.query());
  const { isLoading } = useQueryMetadata(question);
  const reportTimezone = useSetting("report-timezone-long");

  if (isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  if (isNative) {
    return <Editor query={question.query()} readOnly />;
  }

  return (
    <Notebook
      question={question}
      reportTimezone={reportTimezone}
      readOnly
      isDirty={false}
      isRunnable={false}
      isResultDirty={false}
      hasVisualizeButton={false}
      updateQuestion={() => Promise.resolve()}
      runQuestionQuery={() => Promise.resolve()}
    />
  );
}
