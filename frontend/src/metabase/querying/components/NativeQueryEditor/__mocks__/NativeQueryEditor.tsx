import type { ChangeEvent } from "react";

import { useLazyGetTableQuery } from "metabase/api";
import { DataSourceSelectors } from "metabase/querying/components/NativeQueryEditor/DataSourceSelectors";
import { setNativeQueryDatabaseId } from "metabase/querying/native";
import * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import type { NativeQueryEditorCoreProps } from "../NativeQueryEditorRoot";

type NativeQueryEditorProps = Pick<
  NativeQueryEditorCoreProps,
  | "canChangeDatabase"
  | "editorContext"
  | "isNativeEditorOpen"
  | "question"
  | "readOnly"
  | "setQuery"
>;

export const NativeQueryEditor = ({
  canChangeDatabase = true,
  editorContext = "question",
  isNativeEditorOpen,
  question,
  readOnly,
  setQuery,
}: NativeQueryEditorProps) => {
  const query = question.query();
  const [fetchTable] = useLazyGetTableQuery();

  const onChange = (evt: ChangeEvent<HTMLTextAreaElement>) => {
    setQuery(Lib.withNativeQuery(query, evt.target.value));
  };

  const onDatabaseIdChange = (databaseId: DatabaseId) => {
    if (question.databaseId() !== databaseId) {
      setQuery(
        setNativeQueryDatabaseId(query, databaseId, question.metadata()),
      );
    }
  };

  const onTableIdChange = async (tableId: TableId) => {
    const table = await fetchTable({ id: tableId }).unwrap();
    if (table.name !== Lib.nativeExtras(query)?.collection) {
      setQuery(Lib.withNativeExtras(query, { collection: table.name }));
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
      <textarea value={Lib.rawNativeQuery(query)} onChange={onChange} />
    </div>
  );
};

// The composition sub-components are rendered as children of the mocked editor,
// which ignores its children. They only need to be valid components so consumers
// using the composition API keep working under the mock.
const Noop = () => null;
NativeQueryEditor.TopBar = Noop;
NativeQueryEditor.Sidebar = Noop;
NativeQueryEditor.VisibilityToggler = Noop;
NativeQueryEditor.RunButton = Noop;
