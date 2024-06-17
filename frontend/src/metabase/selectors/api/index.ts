import { createSelector } from "@reduxjs/toolkit";

import { getApiDatabases as getDatabases } from "./database";
import { getApiTables as getTables } from "./table";
import { zipEntities } from "./utils";

const getDatabasesFromTables = createSelector(getTables, tables => {
  return Object.values(tables).flatMap(table => (table?.db ? [table.db] : []));
});

const getTablesFromDatabases = createSelector(getDatabases, databases => {
  return Object.values(databases).flatMap(database =>
    database?.tables ? database.tables : [],
  );
});

const getAllApiDatabases = createSelector(
  [getDatabases, getDatabasesFromTables],
  zipEntities,
);

const getAllApiTables = createSelector(
  [getTables, getTablesFromDatabases],
  zipEntities,
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
