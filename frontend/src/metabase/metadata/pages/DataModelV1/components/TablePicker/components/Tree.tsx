import { useEffect } from "react";
import { t } from "ttag";

import { useExpandedState, useTableLoader } from "../hooks";
import type { ChangeOptions, TreePath } from "../types";
import { flatten } from "../utils";

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

  const items = flatten(tree, {
    isExpanded,
    addLoadingNodes: true,
    canFlattenSingleSchema: true,
  });
  const isEmpty = items.length === 0;

  useEffect(() => {
    // When we detect only one database, we automatically select and expand it.
    const databases = tree.children.filter((node) => node.type === "database");

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

  if (isEmpty) {
    return <EmptyState title={t`No data to show`} />;
  }

  return (
    <Results
      items={items}
      path={path}
      reload={reload}
      toggle={toggle}
      withMassToggle
      onItemClick={onChange}
    />
  );
}
