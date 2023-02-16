// define test schema such that they can be used in multiple SQL dialects using
// knex's schema builder https://knexjs.org/guide/schema-builder.html

// we cannot use knex to define multi-dialect schemas because we can only pass
// json-serializable data to cypress tasks (which run in node)
// https://docs.cypress.io/api/commands/task#Arguments

export const colors27745 = async dbClient => {
  const tableName = "colors27745";

  await dbClient.schema.dropTableIfExists(tableName);
  await dbClient.schema.createTable(tableName, table => {
    table.increments("id").primary();
    table.string("name").unique().notNullable();
  });

  await dbClient(tableName).insert([
    { name: "red" },
    { name: "green" },
    { name: "blue" },
  ]);

  return true;
};
