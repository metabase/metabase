/* eslint-disable react/prop-types */
import CS from "metabase/css/core/index.css";
import { DataSourceSelectors } from "metabase/querying/components/NativeQueryEditor/DataSourceSelectors";
import { SyncedParametersList } from "metabase/querying/components/SyncedParametersList";

export const NativeQueryEditor = ({
  canChangeDatabase = true,
  editorContext = "question",
  isNativeEditorOpen,
  query,
  question,
  readOnly,
  setDatasetQuery,
  setParameterValue,
}) => {
  const onChange = (evt) => {
    setDatasetQuery(query.setQueryText(evt.target.value));
  };

  const onDatabaseIdChange = (databaseId) => {
    if (question.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());
    }
  };

  const onTableIdChange = (tableId) => {
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  return (
    <div data-testid="mock-native-query-editor">
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
        className={CS.mt1}
        parameters={query.question().parameters()}
        setParameterValue={setParameterValue}
        commitImmediately
      />
    </div>
  );
};

// The composition sub-components are rendered as children of the mocked editor,
// which ignores its children. They only need to be valid components so consumers
// using the composition API keep working under the mock.
const Noop = () => null;
NativeQueryEditor.TopBar = Noop;
NativeQueryEditor.Sidebar = Noop;
NativeQueryEditor.ParametersList = Noop;
NativeQueryEditor.VisibilityToggler = Noop;
NativeQueryEditor.RunButton = Noop;
