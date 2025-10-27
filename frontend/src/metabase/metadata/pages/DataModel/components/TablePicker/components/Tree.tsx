import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  BulkActionBar,
  BulkActionButton,
} from "metabase/common/components/BulkActionBar";
import { Flex } from "metabase/ui";
import type { DatabaseId, TableId } from "metabase-types/api";

import { useExpandedState, useTableLoader } from "../hooks";
import type { ChangeOptions, DatabaseNode, FlatItem, TreePath } from "../types";
import {
  areTablesSelected,
  flatten,
  getSchemaId,
  getSchemaTableIds,
  noManuallySelectedSchemas,
  noManuallySelectedTables,
  isItemSelected,
  getSchemas,
  type NodeSelection,
  getSchemaTables,
  getSchemaChildrenTableIds,
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
  const [selectedDatabases, setSelectedDatabases] = useState<Set<DatabaseId>>(
    new Set(),
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
    selection: {
      tables: selectedItems,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    },
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

  useEffect(() => {
    const expandedSelectedDatabaseItems = items.filter(
      (x) =>
        x.type === "database" &&
        selectedDatabases.has(x.value?.databaseId ?? -1) &&
        isExpanded(x.key),
    );

    expandedSelectedDatabaseItems.forEach((x) => {
      if (noManuallySelectedSchemas(x, items, selectedSchemas)) {
        // when expanding a db, let's select all the schemas in that db
        const schemaIds = (x as unknown as DatabaseNode).children.map((y) =>
          getSchemaId(y as unknown as FlatItem),
        );
        if (schemaIds.length === 0) {
          return;
        }

        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          schemaIds.forEach((z) => {
            newSet.add(z ?? "");
          });
          return newSet;
        });

        setSelectedDatabases((prev) => {
          const newSet = new Set(prev);
          newSet.delete((x as unknown as DatabaseNode).value?.databaseId ?? -1);
          return newSet;
        });
      }
    });
  }, [isExpanded, selectedDatabases, items, selectedSchemas]);

  function onEditSelectedItems() {
    setIsModalOpen(true);
  }

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  function onItemToggle(item: FlatItem) {
    const isSelected = isItemSelected(item as unknown as TreeNode, {
      tables: selectedItems,
      schemas: selectedSchemas,
      databases: selectedDatabases,
    });

    if (item.type === "table") {
      const tableId = item.value?.tableId ?? -1;
      if (tableId === -1) {
        return;
      }
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        isSelected === "yes" ? newSet.delete(tableId) : newSet.add(tableId);
        return newSet;
      });
    }
    if (item.type === "database") {
      if (item.children.length > 0) {
        const targetChecked = isSelected === "yes" ? "no" : "yes";

        const { schemasSelection, tablesSelection, databasesSelection } =
          markAllSchemas(item, items, targetChecked, {
            tables: selectedItems,
            schemas: selectedSchemas,
            databases: selectedDatabases,
          });
        setSelectedSchemas(schemasSelection);
        setSelectedItems(tablesSelection);
        setSelectedDatabases(databasesSelection);
      } else {
        const databaseId = item.value?.databaseId;
        if (databaseId) {
          setSelectedDatabases((prev) => toggleInSet(prev, databaseId));
        }
      }
    }
    if (item.type === "schema") {
      if (item.children.length > 0) {
        if (isSelected === "yes") {
          setSelectedItems((prev) => {
            const tableIds = getSchemaChildrenTableIds(item);
            const newSet = new Set(prev);
            tableIds.forEach((x) => {
              newSet.delete(x);
            });
            return newSet;
          });
        } else {
          setSelectedItems((prev) => {
            const tableIds = getSchemaChildrenTableIds(item);
            const newSet = new Set(prev);
            tableIds.forEach((x) => {
              newSet.add(x);
            });
            return newSet;
          });
        }
      } else {
        setSelectedSchemas((prev) => {
          const newSet = new Set(prev);
          const schemaId = getSchemaId(item);
          if (!schemaId) {
            return newSet;
          }
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

  const selectedItemsCount =
    selectedItems.size + selectedSchemas.size + selectedDatabases.size;

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
        selectedDatabases={selectedDatabases}
      />
      <Flex justify="center" gap="sm" direction="column">
        <BulkActionBar
          opened={selectedItemsCount > 0 && !isModalOpen}
          message={"" /* TODO: message */}
        >
          <BulkActionButton onClick={onEditSelectedItems}>
            {t`Edit`}
          </BulkActionButton>

          <BulkActionButton
            onClick={() => {
              setSelectedItems(new Set());
              setSelectedSchemas(new Set());
              setSelectedDatabases(new Set());
            }}
          >
            {t`Unselect all `}
          </BulkActionButton>
        </BulkActionBar>
      </Flex>
      <EditTableMetadataModal
        tables={selectedItems}
        schemas={selectedSchemas}
        databases={selectedDatabases}
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

function markAllSchemas(
  item: FlatItem,
  allItems: FlatItem[],
  targetChecked: "yes" | "no",
  selection: NodeSelection,
) {
  const schemasSelection = new Set(selection.schemas);
  const tablesSelection = new Set(selection.tables);

  const schemas = getSchemas(item, allItems);
  schemas.forEach((schema) => {
    const schemaId = getSchemaId(schema);
    if (!schemaId) {
      return;
    }
    if (schema.children.length > 0) {
      targetChecked === "yes"
        ? schemasSelection.add(schemaId)
        : schemasSelection.delete(schemaId);
    } else {
      markAllTables(schema, allItems, targetChecked, tablesSelection);
    }
  });

  return {
    schemasSelection,
    tablesSelection,
    databasesSelection: selection.databases,
  };
}

function markAllTables(
  schema: FlatItem,
  allItems: FlatItem[],
  targetChecked: "yes" | "no",
  tablesSelection: Set<TableId>,
) {
  const tables = getSchemaTables(schema, allItems);
  tables.forEach((table) => {
    const tableId = table.value?.tableId ?? -1;
    if (tableId === -1) {
      return;
    }
    targetChecked === "yes"
      ? tablesSelection.add(tableId)
      : tablesSelection.delete(tableId);
  });

  return tablesSelection;
}

function toggleInSet<T>(set: Set<T>, item: T) {
  const newSet = new Set(set);
  if (newSet.has(item)) {
    newSet.delete(item);
  } else {
    newSet.add(item);
  }
  return newSet;
}
