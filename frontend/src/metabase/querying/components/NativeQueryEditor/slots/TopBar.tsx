import { type PropsWithChildren, type ReactNode, forwardRef } from "react";

import { useLazyGetTableQuery, useLazyListTablesQuery } from "metabase/api";
import {
  requiresNativeCollection,
  setNativeQueryDatabaseId,
  setNativeQueryDefaultCollection,
} from "metabase/querying/native";
import { Flex } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatabaseId, TableId } from "metabase-types/api";

import { DataSourceSelectors } from "../DataSourceSelectors/DataSourceSelectors";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

type TopBarProps = PropsWithChildren<{
  leftContent?: ReactNode;
}>;

/**
 * The top bar of the native query editor. Renders the data source selector,
 * then `leftContent`, and right-aligns its children.
 */
export const TopBar = forwardRef<HTMLDivElement, TopBarProps>(function TopBar(
  { leftContent, children },
  ref,
) {
  const {
    question,
    query,
    canChangeDatabase,
    isNativeEditorOpen,
    readOnly,
    editorContext,
    setQuery,
    onSetDatabaseId,
    focusEditor,
    databaseIsDisabled,
    databaseDisabledTooltip,
  } = useNativeQueryEditorContext();
  const [fetchTable] = useLazyGetTableQuery();
  const [fetchTables] = useLazyListTablesQuery();

  if (!question) {
    return null;
  }

  const setTableId = async (tableId: TableId) => {
    const table = await fetchTable({ id: tableId }).unwrap();
    if (table.name !== Lib.nativeExtras(query)?.collection) {
      setQuery(Lib.withNativeExtras(query, { collection: table.name }));
    }
  };

  const setDatabaseId = async (databaseId: DatabaseId) => {
    if (question.databaseId() === databaseId) {
      return;
    }
    const newQuery = setNativeQueryDatabaseId(
      query,
      databaseId,
      question.metadata(),
    );
    const tables = requiresNativeCollection(newQuery)
      ? await fetchTables({ dbId: databaseId }).unwrap()
      : [];
    setQuery(setNativeQueryDefaultCollection(newQuery, tables));
    onSetDatabaseId?.(databaseId);
    focusEditor();
  };

  return (
    <Flex align="flex-start" data-testid="native-query-top-bar" ref={ref}>
      {canChangeDatabase && (
        <DataSourceSelectors
          isNativeEditorOpen={isNativeEditorOpen}
          query={query}
          question={question}
          readOnly={readOnly}
          setDatabaseId={setDatabaseId}
          setTableId={setTableId}
          editorContext={editorContext}
          databaseIsDisabled={databaseIsDisabled}
          databaseDisabledTooltip={databaseDisabledTooltip}
        />
      )}
      {leftContent}
      <Flex ml="auto" gap="xl" mr="xl" align="center" h="3rem" pl="lg">
        {children}
      </Flex>
    </Flex>
  );
});
