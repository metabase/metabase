import React from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";

import type NativeQuery from "metabase-lib/queries/NativeQuery";

function QueryActionEditor({
  query,
  onChangeQuestionQuery,
}: {
  query: NativeQuery;
  onChangeQuestionQuery: (query: NativeQuery) => void;
}) {
  return (
    <>
      <NativeQueryEditor
        query={query}
        viewHeight="full"
        setDatasetQuery={onChangeQuestionQuery}
        enableRun={false}
        hasEditingSidebar={false}
        isNativeEditorOpen
        hasParametersList={false}
        resizable={false}
        readOnly={false}
        requireWriteback
      />
    </>
  );
}

export default QueryActionEditor;
