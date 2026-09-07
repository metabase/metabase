import { type PropsWithChildren, type ReactNode, forwardRef } from "react";

import { Flex } from "metabase/ui";
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
    setDatasetQuery,
    onSetDatabaseId,
    focusEditor,
    databaseIsDisabled,
    databaseDisabledTooltip,
  } = useNativeQueryEditorContext();

  if (!question) {
    return null;
  }

  const setTableId = (tableId: TableId) => {
    const table = query.metadata().table(tableId);
    if (table && table.name !== query.collection()) {
      setDatasetQuery(query.setCollectionName(table.name));
    }
  };

  const setDatabaseId = (databaseId: DatabaseId) => {
    if (question.databaseId() !== databaseId) {
      setDatasetQuery(query.setDatabaseId(databaseId).setDefaultCollection());
      onSetDatabaseId?.(databaseId);
      focusEditor();
    }
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
