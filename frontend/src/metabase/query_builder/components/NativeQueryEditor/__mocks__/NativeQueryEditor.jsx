/* eslint-disable react/prop-types */
import { useMemo } from "react";

import SyncedParametersList from "metabase/parameters/components/SyncedParametersList/SyncedParametersList";
import DataSourceSelectors from "metabase/query_builder/components/NativeQueryEditor/DataSourceSelectors";
import { ACE_ELEMENT_ID } from "metabase/query_builder/components/NativeQueryEditor/constants";

const MockNativeQueryEditor = ({
  canChangeDatabase = true,
  editorContext = "question",
  isNativeEditorOpen,
  query,
  question,
  readOnly,
  setDatasetQuery,
  setParameterValue,
}) => {
  const onChange = evt => {
    setDatasetQuery(query.setQueryText(evt.target.value));
  };

  const onDatabaseIdChange = databaseId => {
    if (question.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());
    }
  };

  const onTableIdChange = tableId => {
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  const parameters = useMemo(() => {
    query.question().parameters();
  }, [query]);

  return (
    <div data-testid="mock-native-query-editor" id={ACE_ELEMENT_ID}>
      {canChangeDatabase && (
        <DataSourceSelectors
          isNativeEditorOpen={isNativeEditorOpen}
          query={query}
          question={question}
          readOnly={readOnly}
          setDatabaseId={onDatabaseIdChange}
          setTableId={onTableIdChange}
          editorContext={editorContext}
        />
      )}
      {query.queryText && (
        <textarea value={query.queryText()} onChange={onChange} />
      )}
      <SyncedParametersList
        className="mt1"
        parameters={parameters}
        setParameterValue={setParameterValue}
        commitImmediately
      />
    </div>
  );
};

export default MockNativeQueryEditor;
