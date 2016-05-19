/* @flow */

import Metadata from "./Metadata";
import Database from "./Database";

// async function getDatabases() {
//     let response = await fetch("/api/database?include_tables=true", { credentials: 'same-origin' });
//     return await response.json();
// }
//
// async function getTable(table) {
//     let response = await fetch("/api/table/" + table.id + "/query_metadata", { credentials: 'same-origin' });
//     return await response.json();
// }
//
// async function loadDatabaseTables(database) {
//     database.tables = await Promise.all(database.tables.map(getTable));
// }
//
// async function loadMetadata() {
//     let databases = await getDatabases();
//     await Promise.all(databases.map(loadDatabaseTables));
//     return databases;
// }
//
// loadMetadata().then((databases) => {
//     window.m = new Metadata(databases);
//     window.d = new Database(databases[0]);
//     console.log(window.m.databases());
//     console.log(window.m.databases()[1].tables()[0].field(1835).target().table().database().tables()[0].fields()[0].isNumeric());
//     console.log(window.d.tables());
// }).then(null, (err) => console.error(err))


import type { DatasetQueryType } from "./QueryTypes";

export const DatasetQuery = {
    isStructured(dataset_query : DatasetQueryType) : boolean {
        return dataset_query && dataset_query.type === "query";
    },

    isNative(dataset_query : DatasetQueryType) : boolean {
        return dataset_query && dataset_query.type === "native";
    },
};

const dataset_query : DatasetQueryType = {"database":10,"type":"query","query":{"source_table":89,"aggregation":["metric",6],"breakout":[],"filter":["and",["segment",7]]}};

console.log(DatasetQuery.isStructured(dataset_query));
console.log(DatasetQuery.isNative(dataset_query));

// console.log(DatasetQuery.isNative({})); // FAILS TYPECHECKING!
