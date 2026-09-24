import cx from "classnames";
import { useMemo, useState } from "react";
import { c, t } from "ttag";

import { Box, Icon, Loader, Text, TextInput } from "metabase/ui";
import type { Database, DatabaseId, IconName } from "metabase-types/api";

import S from "../NodeBuilder.module.css";
import type { SourceItem, SourceKind } from "../types";

const KIND_ORDER: Record<SourceKind, number> = {
  table: 0,
  model: 1,
  question: 2,
};
const KIND_ICONS: Record<SourceKind, IconName> = {
  table: "table2",
  model: "model",
  question: "table",
};

type SourceListProps = {
  databases: Database[];
  sources: SourceItem[];
  isLoading: boolean;
  // Once the canvas is tied to a database, tables from other databases are
  // shown but cannot be picked.
  sourceDatabaseId: DatabaseId | null;
  onPick: (source: SourceItem) => void;
};

// Searchable list of every table, model and saved question, grouped under
// collapsible database headers.
export function SourceList({
  databases,
  sources,
  isLoading,
  sourceDatabaseId,
  onPick,
}: SourceListProps) {
  const [search, setSearch] = useState("");
  const [collapsedDatabaseIds, setCollapsedDatabaseIds] = useState<
    Set<DatabaseId>
  >(new Set());

  const toggleDatabase = (databaseId: DatabaseId) => {
    setCollapsedDatabaseIds((ids) => {
      const next = new Set(ids);
      if (next.has(databaseId)) {
        next.delete(databaseId);
      } else {
        next.add(databaseId);
      }
      return next;
    });
  };

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byDatabase = new Map<DatabaseId, SourceItem[]>();
    sources.forEach((source) => {
      if (!source.name.toLowerCase().includes(needle)) {
        return;
      }
      const list = byDatabase.get(source.databaseId) ?? [];
      list.push(source);
      byDatabase.set(source.databaseId, list);
    });
    return databases
      .filter((database) => byDatabase.has(database.id))
      .map((database) => ({
        database,
        sources: (byDatabase.get(database.id) ?? []).sort(
          (a, b) =>
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            a.name.localeCompare(b.name),
        ),
        isDisabled:
          sourceDatabaseId != null && database.id !== sourceDatabaseId,
      }))
      .sort((a, b) => Number(a.isDisabled) - Number(b.isDisabled));
  }, [databases, sources, search, sourceDatabaseId]);

  return (
    <div className={S.tableList} data-testid="node-builder-table-list">
      <Box px="sm" pt="sm" pb="xs">
        <TextInput
          size="xs"
          placeholder={t`Search tables, models and questions…`}
          leftSection={<Icon name="search" size={12} />}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
      </Box>
      <div className={S.paletteList}>
        {isLoading && (
          <Box p="md" ta="center">
            <Loader size="sm" />
          </Box>
        )}
        {groups.map(({ database, sources: databaseSources, isDisabled }) => {
          const isCollapsed = collapsedDatabaseIds.has(database.id);
          return (
            <div
              key={database.id}
              className={cx(S.paletteGroup, { [S.disabledGroup]: isDisabled })}
              title={
                isDisabled
                  ? t`Joins must use the same database as the source`
                  : undefined
              }
            >
              <button
                type="button"
                className={S.groupHeader}
                aria-expanded={!isCollapsed}
                onClick={() => toggleDatabase(database.id)}
              >
                <Icon name="database" size={12} />
                <span className={S.groupName}>{database.name}</span>
                <Icon
                  name={isCollapsed ? "chevronright" : "chevrondown"}
                  size={10}
                  className={S.groupChevron}
                />
              </button>
              {!isCollapsed &&
                databaseSources.map((source) => (
                  <div
                    key={source.id}
                    className={S.paletteItem}
                    onClick={isDisabled ? undefined : () => onPick(source)}
                  >
                    <Icon name={KIND_ICONS[source.kind]} size={14} />
                    <Text fz="sm" truncate style={{ flex: 1 }}>
                      {source.name}
                    </Text>
                    <button
                      type="button"
                      className={S.paletteAdd}
                      aria-label={c("{0} is a table, model or question name")
                        .t`Pick ${source.name}`}
                      disabled={isDisabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        onPick(source);
                      }}
                    >
                      <Icon name="add" size={12} />
                    </button>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
