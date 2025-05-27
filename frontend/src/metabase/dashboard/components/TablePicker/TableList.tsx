import { useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListTablesQuery } from "metabase/api";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import SelectList from "metabase/components/SelectList/SelectList";
import { useDebouncedValue } from "metabase/hooks/use-debounced-value";
import { color } from "metabase/lib/colors";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { Box, Stack, Text, TextInput } from "metabase/ui";
import type { Database, DatabaseId, TableId } from "metabase-types/api";

const ROOT_BREADCRUMB_ID = "root";

type TableListProps = {
  onSelect: (cardId: TableId) => void;
};

export const TableList = ({ onSelect }: TableListProps) => {
  const { data: tables, isLoading } = useListTablesQuery();
  const tablesWithEnabledEditing = useMemo(() => {
    return (
      tables
        ?.filter(({ db }) => {
          const hasDbSetting = db?.settings?.["database-enable-table-editing"];
          const isServiceTable = db?.is_audit;

          return hasDbSetting && !isServiceTable;
        })
        .sort((a, b) => {
          // sort by db name, then table name
          const aDbName = a.db?.name || "";
          const bDbName = b.db?.name || "";

          const dbOrder = aDbName.localeCompare(bDbName);
          if (dbOrder !== 0) {
            return dbOrder;
          }

          return a.display_name.localeCompare(b.display_name);
        }) || []
    );
  }, [tables]);

  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );

  const [databases, databasesById] = useMemo(() => {
    const dbs = _.uniq(
      tablesWithEnabledEditing.map((t) => t.db as Database).filter(Boolean),
      false,
      (db: Database) => db.id,
    );
    const dbsById = {
      ...dbs.reduce(
        (acc, db) => {
          if (!db) {
            return acc;
          }
          acc[db.id] = db;
          return acc;
        },
        {} as Record<number, Database>,
      ),
      [ROOT_BREADCRUMB_ID]: {
        id: ROOT_BREADCRUMB_ID,
        name: t`Databases`,
        children: dbs,
      },
    } as Record<number, Database> & {
      [ROOT_BREADCRUMB_ID]: { id: "root"; name: string; children: Database[] };
    };
    return [dbs, dbsById];
  }, [tablesWithEnabledEditing]);
  const [selectedDb, setSelectedDb] = useState<number | null>(null);
  const database =
    selectedDb && typeof selectedDb === "number"
      ? databasesById[selectedDb]
      : null;

  const crumbs = getDatabaseBreadcrumbs(database, databasesById, setSelectedDb);

  const filteredTables = useMemo(() => {
    return tablesWithEnabledEditing?.filter((table) => {
      return debouncedSearchText
        ? table.display_name
            .toLowerCase()
            .includes(debouncedSearchText.toLowerCase())
        : table.db_id === selectedDb;
    });
  }, [tablesWithEnabledEditing, debouncedSearchText, selectedDb]);

  if (isLoading) {
    return null;
  }

  return (
    <Stack>
      <TextInput
        onChange={(e) => {
          setSearchText(e.target.value);
          if (selectedDb) {
            setSelectedDb(null);
          }
        }}
        placeholder={t`Search…`}
        autoFocus
      />
      {debouncedSearchText && !filteredTables?.length && (
        <Text>{t`Nothing found`}</Text>
      )}
      {!debouncedSearchText && (
        <Box px="sm">
          <Breadcrumbs crumbs={crumbs} />
        </Box>
      )}

      <SelectList>
        {selectedDb || debouncedSearchText
          ? filteredTables?.map((item) => (
              <SelectList.Item
                key={item.id}
                id={item.id}
                name={item.display_name}
                icon={{
                  name: "table",
                  size: 16,
                }}
                onSelect={onSelect}
              />
            ))
          : databases?.map((db) => (
              <SelectList.Item
                key={db.id}
                id={db.id}
                name={db.name}
                icon={{
                  name: "database",
                  size: 16,
                  color: color("database"),
                }}
                rightIcon="chevronright"
                onSelect={() => setSelectedDb(db.id)}
              />
            ))}
      </SelectList>
    </Stack>
  );
};

function getDatabaseBreadcrumbs(
  db: Database | null,
  dbsById: Record<DatabaseId, Database> & {
    [ROOT_BREADCRUMB_ID]: { id: "root"; name: string };
  },
  callback: (id: DatabaseId | null) => void,
) {
  const rootCollection = dbsById[ROOT_BREADCRUMB_ID];
  if (db) {
    return [[rootCollection.name, () => callback(null)], [db.name]];
  } else {
    return [...(rootCollection ? [[rootCollection.name]] : [])];
  }
}
