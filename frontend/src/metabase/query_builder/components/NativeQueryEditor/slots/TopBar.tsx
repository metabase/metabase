import {
  Children,
  type PropsWithChildren,
  type ReactNode,
  forwardRef,
  isValidElement,
} from "react";

import { Flex } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import { DataSourceSelectors } from "../DataSourceSelectors/DataSourceSelectors";
import { useNativeQueryEditorContext } from "../context/NativeQueryEditorContext";

import { ParametersList } from "./ParametersList";

/**
 * The top bar of the native query editor. Renders the data source selector on
 * the left (from context) and lays out its children, keeping the parameters
 * list on the left and pushing the remaining actions (sidebar buttons,
 * visibility toggler, custom content) into the right-aligned cluster.
 */
export const TopBar = forwardRef<HTMLDivElement, PropsWithChildren>(
  function TopBar({ children }, ref) {
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

    const leftActions: ReactNode[] = [];
    const rightActions: ReactNode[] = [];
    Children.toArray(children).forEach((child) => {
      if (isValidElement(child) && child.type === ParametersList) {
        leftActions.push(child);
      } else {
        rightActions.push(child);
      }
    });

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
        {leftActions}
        <Flex ml="auto" gap="lg" mr="lg" align="center" h="3rem" pl="md">
          {rightActions}
        </Flex>
      </Flex>
    );
  },
);
