import { useEffect, useState } from "react";
import { t } from "ttag";

import { Button, Flex } from "metabase/ui";
import type { TableId } from "metabase-types/api";

import { useExpandedState, useTableLoader } from "../hooks";
import type { ChangeOptions, DatabaseNode, FlatItem, TreePath } from "../types";
import {
  areTablesSelected,
  flatten,
  getSchemaId,
  getSchemaTableIds,
  noManuallySelectedTables,
} from "../utils";

import { EditTableMetadataModal } from "./EditTableMetadataModal";
import { EmptyState } from "./EmptyState";
import { Results } from "./Results";

interface Props {
  path: TreePath;
  onChange: (path: TreePath, options?: ChangeOptions) => void;
}

export function Tree({ path, onChange }: Props) {
  const { databaseId, schemaName } = path;
  const { isExpanded, toggle } = useExpandedState(path);
  const { tree, reload } = useTableLoader(path);
  const [selectedItems, setSelectedItems] = useState<Set<TableId>>(new Set());
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
  });
  const isEmpty = items.length === 0;

  useEffect(() => {
    // When we detect only one database, we automatically select and expand it.
    const databases = tree.children.filter(
      (node) => (node as DatabaseNode).type === "database",
    ) as DatabaseNode[];

    if (databases.length !== 1) {
      return;
    }

    const [database] = databases;

    if (
      !isExpanded({ databaseId: database.value.databaseId }) &&
      databaseId == null
    ) {
      toggle(database.key, true);
      onChange(database.value, { isAutomatic: true });
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    // When we detect a database with just one schema, we automatically
    // select and expand that schema.
    const database = tree.children.find(
      (node) =>
        node.type === "database" && node.value.databaseId === databaseId,
    );
    if (
      databaseId &&
      isExpanded({ databaseId }) &&
      database?.children.length === 1 &&
      schemaName == null
    ) {
      const schema = database.children[0];
      if (schema.type === "schema") {
        toggle(schema.key, true);
        onChange(schema.value, { isAutomatic: true });
      }
    }
  }, [databaseId, schemaName, tree, toggle, isExpanded, onChange]);

  useEffect(() => {
    const expandedSelectedSchemaItems = items.filter(
      (x) =>
        x.type === "schema" &&
        selectedSchemas.has(getSchemaId(x) ?? "") &&
        isExpanded(x.key),
    );

    expandedSelectedSchemaItems.forEach((x) => {
      if (noManuallySelectedTables(x, items, selectedItems)) {
        // when expanding a schema, let's select all the tables in that schema
        const tableIds = getSchemaTableIds(x, items);
        if (tableIds.length === 0) {
          return;
        }

        setSelectedItems((prev) => {
          const newSet = new Set(prev);
          tableIds.forEach((x) => {
            newSet.add(x);
          });
          return newSet;
        });

        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          newSet.delete(getSchemaId(x) ?? "");
          return newSet;
        });
      }
    });
  }, [isExpanded, selectedSchemas, items, selectedItems]);

  function onEditSelectedItems() {
    setIsModalOpen(true);
  }

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  function onItemToggle(item: FlatItem) {
    if (item.type === "table") {
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(item.value?.tableId ?? "")) {
          newSet.delete(item.value?.tableId ?? "");
        } else {
          newSet.add(item.value?.tableId ?? "");
        }
        return newSet;
      });
    }
    if (item.type === "schema") {
      if (isExpanded(item.key)) {
        if (areTablesSelected(item, items, selectedItems) === "all") {
          setSelectedItems(() => {
            return new Set();
          });
        } else {
          setSelectedItems(() => {
            return new Set(getSchemaTableIds(item, items));
          });
        }
      } else {
        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          const schemaId = getSchemaId(item);
          if (schemaId && newSet.has(schemaId)) {
            newSet.delete(schemaId);
          } else {
            newSet.add(schemaId);
          }
          return newSet;
        });
      }
    }
  }

  return (
    <>
      <Results
        items={items}
        path={path}
        reload={reload}
        toggle={toggle}
        withMassToggle
        onItemClick={onChange}
        onItemToggle={onItemToggle}
        selectedItems={selectedItems}
        selectedSchemas={selectedSchemas}
      />
      <Flex justify="center" gap="sm" direction="column">
        {selectedItems.size > 0 && (
          <>
            <Flex justify="center">
              <Button onClick={onEditSelectedItems}>
                {t`Edit ${selectedItems.size} items`}
              </Button>
            </Flex>
            <Button
              variant="transparent"
              onClick={() => setSelectedItems(new Set())}
            >
              {t`Unselect all`}
            </Button>
          </>
        )}
      </Flex>
      <EditTableMetadataModal
        tables={selectedItems}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onUpdate={() => {
          reload(path);
          setSelectedItems(new Set());
        }}
      />
    </>
  );
}
