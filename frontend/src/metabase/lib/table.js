import { addValidOperatorsToFields } from "metabase/lib/schema_metadata";

export function augmentDatabase(database) {
  database.tables_lookup = createLookupByProperty(database.tables, "id");
  for (const table of database.tables) {
    addValidOperatorsToFields(table);
    table.fields_lookup = createLookupByProperty(table.fields, "id");
    for (const field of table.fields) {
      addFkTargets(field, database.tables_lookup);
      field.filter_operators_lookup = createLookupByProperty(
        field.filter_operators,
        "name",
      );
    }
  }
  return database;
}

function addFkTargets(field, tables) {
  if (field.target != null) {
    field.target.table = tables[field.target.table_id];
  }
}

export function createLookupByProperty(items, property) {
  return items.reduce((lookup, item) => {
    lookup[item[property]] = item;
    return lookup;
  }, {});
}
