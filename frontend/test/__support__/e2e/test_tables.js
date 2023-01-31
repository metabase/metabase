// define test schema such that they can be used in multiple SQL dialects using
// knex's schema builder https://knexjs.org/guide/schema-builder.html

// we cannot use knex to define multi-dialect schemas because we can only pass
// json-serializable data to cypress tasks (which run in node)
// https://docs.cypress.io/api/commands/task#Arguments
