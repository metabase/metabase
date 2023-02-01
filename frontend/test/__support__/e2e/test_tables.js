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

export const scoreboard_actions = async dbClient => {
  const tableName = "scoreboard_actions";

  await dbClient.schema.dropTableIfExists(tableName);
  await dbClient.schema.createTable(tableName, table => {
    table.increments("id").primary();
    table.string("team_name").unique().notNullable();
    table.integer("score").notNullable().defaultTo(0);
    table.string("status").notNullable().defaultTo("active");
    table.timestamps(false, true);
  });

  await dbClient(tableName).insert([
    { team_name: "Amorous Aardvarks", score: 0 },
    { team_name: "Bouncy Bears", score: 10 },
    { team_name: "Cuddly Cats", score: 20 },
    { team_name: "Dusty Ducks", score: 25 },
    { team_name: "Energetic Elephants", score: 30 },
    { team_name: "Funky Flamingos", score: 30, status: "suspended" },
    { team_name: "Generous Giraffes", score: 30 },
    { team_name: "Hilarious Hippos", score: 40 },
    { team_name: "Incredible Iguanas", score: 50, status: "retired" },
    { team_name: "Jolly Jellyfish", score: 60 },
    { team_name: "Kind Koalas", score: 70 },
    { team_name: "Lively Lemurs", score: 80 },
    { team_name: "Mighty Monkeys", score: 90, status: "inactive" },
    { team_name: "Nifty Narwhals", score: 100 },
  ]);

  return true;
};
