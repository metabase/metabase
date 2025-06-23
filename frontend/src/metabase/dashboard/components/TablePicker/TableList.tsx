import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { useListTablesQuery } from "metabase/api";
import Breadcrumbs from "metabase/common/components/Breadcrumbs";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import SelectList from "metabase/common/components/SelectList";
import { ItemTitle } from "metabase/common/components/SelectList/SelectListItem.styled";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";
import { humanize } from "metabase/lib/formatting";
import {
  Box,
  FixedSizeIcon,
  Flex,
  Group,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaName,
  TableId,
} from "metabase-types/api";

import S from "./TableList.module.css";

type TableListProps = {
  onSelect: (tableId: TableId) => void;
};

export const TableList = ({ onSelect }: TableListProps) => {
  const { data: tables, isLoading } = useListTablesQuery();

  const tablesWithEnabledEditing = useMemo(() => {
    return (
      tables?.filter(({ db }) => {
        const hasDbSetting = db?.settings?.["database-enable-table-editing"];
        const isServiceTable = db?.is_audit;
        return hasDbSetting && !isServiceTable;
      }) || []
    );
  }, [tables]);

  const [searchText, setSearchText] = useState("");
  const debouncedSearchText = useDebouncedValue(
    searchText,
    SEARCH_DEBOUNCE_DURATION,
  );
  const [selectedDatabaseId, setSelectedDatabaseId] =
    useState<DatabaseId | null>(null);
  const [selectedSchemaName, setSelectedSchemaName] =
    useState<SchemaName | null>(null);

  // Build databases list
  const [databases, databasesById] = useMemo(() => {
    const dbs = _.uniq(
      tablesWithEnabledEditing.map((t) => t.db as Database).filter(Boolean),
      false,
      (db: Database) => db.id,
    );
    const dbsById = dbs.reduce(
      (acc, db) => {
        acc[db.id] = db;
        return acc;
      },
      {} as Record<number, Database>,
    );
    return [dbs, dbsById];
  }, [tablesWithEnabledEditing]);

  // Auto-select database if only one exists
  useEffect(() => {
    if (databases?.length === 1 && !selectedDatabaseId) {
      setSelectedDatabaseId(databases[0].id);
    }
  }, [databases, selectedDatabaseId]);

  // Build schemas list for selected database
  const schemas = useMemo(() => {
    if (!selectedDatabaseId) {
      return [];
    }
    const tablesInDb = tablesWithEnabledEditing.filter(
      (t) => t.db_id === selectedDatabaseId,
    );
    const uniqueSchemas = _.uniq(tablesInDb.map((t) => t.schema)).filter(
      Boolean,
    );
    return uniqueSchemas;
  }, [selectedDatabaseId, tablesWithEnabledEditing]);

  // Auto-select schema if only one exists
  useEffect(() => {
    if (schemas?.length === 1 && !selectedSchemaName) {
      setSelectedSchemaName(schemas[0]);
    }
  }, [schemas, selectedSchemaName]);

  // Breadcrumbs
  const crumbs = useMemo(() => {
    const db = selectedDatabaseId ? databasesById[selectedDatabaseId] : null;
    const schema = schemas?.find((s) => s === selectedSchemaName);
    const arr: any[] = [
      [
        t`Databases`,
        () => {
          setSelectedDatabaseId(null);
          setSelectedSchemaName(null);
          setSearchText("");
        },
      ],
    ];
    if (db) {
      arr.push([
        db.name,
        () => {
          setSelectedSchemaName(null);
          setSearchText("");
        },
      ]);
    }
    if (schema) {
      arr.push([schema]);
    }
    return arr;
  }, [selectedDatabaseId, selectedSchemaName, databasesById, schemas]);

  // Filtered tables for search or selection
  const filteredTables = useMemo(() => {
    if (debouncedSearchText) {
      return tablesWithEnabledEditing.filter((table) =>
        table.display_name
          .toLowerCase()
          .includes(debouncedSearchText.toLowerCase()),
      );
    }
    if (selectedDatabaseId && selectedSchemaName) {
      return tablesWithEnabledEditing.filter((table) => {
        if (table.db_id !== selectedDatabaseId) {
          return false;
        }
        const tableSchemaIdentifier = table.schema;
        return tableSchemaIdentifier === selectedSchemaName;
      });
    }
    return [];
  }, [
    debouncedSearchText,
    tablesWithEnabledEditing,
    selectedDatabaseId,
    selectedSchemaName,
  ]);

  if (isLoading) {
    return <Text mt="md">{t`Loading...`}</Text>;
  }

  return (
    <Stack>
      <TextInput
        onChange={(e) => {
          setSearchText(e.target.value);
          if (e.target.value) {
            setSelectedDatabaseId(null);
            setSelectedSchemaName(null);
          }
        }}
        placeholder={t`Search…`}
        value={searchText}
        autoFocus
      />
      {!debouncedSearchText && (
        <Box px="sm">
          <Breadcrumbs crumbs={crumbs} />
        </Box>
      )}
      {debouncedSearchText ? (
        filteredTables.length ? (
          <SelectList>
            {filteredTables?.map((item) => (
              <SelectList.Item
                key={item.id}
                id={item.id}
                name={item.display_name}
                icon={{
                  name: "table",
                  size: 16,
                }}
                className={S.filteredResult}
                onSelect={onSelect}
                renderTitle={(name) => (
                  <Group
                    wrap="nowrap"
                    className={S.tableLocationGroup}
                    w="100%"
                  >
                    <ItemTitle lh="normal" maw="70%">
                      <Ellipsified style={{ fontWeight: "bold" }}>
                        {name}
                      </Ellipsified>
                    </ItemTitle>
                    <Flex
                      direction="row"
                      ml="auto"
                      style={{
                        overflow: "hidden",
                      }}
                      align="center"
                      gap="sm"
                    >
                      <FixedSizeIcon c="inherit" name="database" />
                      <Ellipsified>
                        {t`in ${item.db?.name}${item.schema ? ` (${humanize(item.schema)})` : ""}`}
                      </Ellipsified>
                    </Flex>
                  </Group>
                )}
              />
            ))}
          </SelectList>
        ) : (
          <Text>{t`Nothing found`}</Text>
        )
      ) : !selectedDatabaseId ? (
        <SelectList>
          {databases?.map((item) => (
            <SelectList.Item
              key={item.id}
              id={item.id}
              name={item.name}
              icon={{
                name: "database",
                size: 16,
              }}
              rightIcon={{
                name: "chevronright",
                size: 16,
              }}
              onSelect={() => {
                setSelectedDatabaseId(item.id);
                setSelectedSchemaName(null);
              }}
            />
          ))}
        </SelectList>
      ) : schemas.length > 1 && !selectedSchemaName ? (
        <SelectList>
          {schemas?.map((item) => (
            <SelectList.Item
              key={item}
              id={item}
              name={humanize(item)}
              icon={{
                name: "folder",
                size: 16,
              }}
              rightIcon={{
                name: "chevronright",
                size: 16,
              }}
              onSelect={() => {
                setSelectedSchemaName(item);
              }}
            />
          ))}
        </SelectList>
      ) : (
        <SelectList>
          {filteredTables?.map((item) => (
            <SelectList.Item
              key={item.id}
              id={item.id}
              name={item.display_name}
              icon={{
                name: "table",
                size: 16,
              }}
              onSelect={() => {
                onSelect(item.id);
              }}
            />
          ))}
        </SelectList>
      )}
    </Stack>
  );
};
