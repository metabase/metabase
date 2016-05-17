/* @flow weak */

import Metadata from "./Metadata";
import Database from "./Database";

async function getDatabases() {
    let response = await fetch("/api/database?include_tables=true", { credentials: 'same-origin' });
    return await response.json();
}

async function getTable(table) {
    let response = await fetch("/api/table/" + table.id + "/query_metadata", { credentials: 'same-origin' });
    return await response.json();
}

async function loadDatabaseTables(database) {
    database.tables = await Promise.all(database.tables.map(getTable));
}

async function loadMetadata() {
    let databases = await getDatabases();
    await Promise.all(databases.map(loadDatabaseTables));
    return databases;
}

loadMetadata().then((databases) => {
    window.m = new Metadata(databases);
    window.d = new Database(databases[0]);
    console.log(window.m.databases());
    console.log(window.m.databases()[1].tables()[0].field(1835).target().table().database().tables()[0].fields()[0].isNumeric());
    console.log(window.d.tables());
}).then(null, (err) => console.error(err))
