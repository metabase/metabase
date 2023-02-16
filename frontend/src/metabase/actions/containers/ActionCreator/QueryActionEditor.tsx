import React from "react";

import NativeQueryEditor from "metabase/query_builder/components/NativeQueryEditor";

import type NativeQuery from "metabase-lib/queries/NativeQuery";

function QueryActionEditor({
  query,
  isEditable,
  onChangeQuestionQuery,
}: {
  query: NativeQuery;
  isEditable: boolean;
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
        readOnly={!isEditable}
        requireWriteback
      />
    </>
  );
}

export default QueryActionEditor;
