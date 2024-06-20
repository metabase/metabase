import { createSelector } from "@reduxjs/toolkit";

import { getApiDatabases as getDatabases } from "./database";
import { getApiTables as getTables } from "./table";
import type { DatabaseEntries, TableEntries } from "./types";
import { zip } from "./utils";

const getDatabasesFromTables = createSelector(
  getTables,
  (entries): DatabaseEntries[] => {
    return entries.map(entry => {
      return {
        entities: entry.entities.flatMap(table => (table.db ? [table.db] : [])),
        fulfilledTimeStamp: entry.fulfilledTimeStamp,
      };
    });
  },
);

const getTablesFromDatabases = createSelector(
  getDatabases,
  (entries): TableEntries[] => {
    return entries.map(entry => {
      return {
        entities: entry.entities.flatMap(database => database.tables ?? []),
        fulfilledTimeStamp: entry.fulfilledTimeStamp,
      };
    });
  },
);

const getAllApiDatabases = createSelector(
  [getDatabases, getDatabasesFromTables],
  zip,
);

const getAllApiTables = createSelector(
  [getTables, getTablesFromDatabases],
  zip,
);

export const getApiEntities = createSelector(
  [getAllApiDatabases, getAllApiTables],
  (databases, tables) => {
    return {
      databases,
      tables,
    };
  },
);
