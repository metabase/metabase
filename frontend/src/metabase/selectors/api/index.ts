import { createSelector } from "@reduxjs/toolkit";

import { getApiDatabases as getDatabases } from "./database";
import { getApiTables as getTables } from "./table";
import { zipEntities } from "./utils";

const getAllApiDatabases = createSelector(
  [getDatabases, getTables],
  (databases, tables) => {
    const databasesFromTables = Object.values(tables).flatMap(table =>
      table?.db ? [table.db] : [],
    );

    return zipEntities(databases, databasesFromTables);
  },
);

const getAllApiTables = createSelector(
  [getDatabases, getTables],
  (databases, tables) => {
    const tablesFromDatabases = Object.values(databases).flatMap(database =>
      database?.tables ? database.tables : [],
    );

    return zipEntities(tables, tablesFromDatabases);
  },
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
