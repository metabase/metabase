// define test schema such that they can be used in multiple SQL dialects using
// knex's schema builder https://knexjs.org/guide/schema-builder.html

// we cannot use knex to define multi-dialect schemas because we can only pass
// json-serializable data to cypress tasks (which run in node)
// https://docs.cypress.io/api/commands/task#Arguments

import { many_data_types_rows } from "./test_tables_data";

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

  return null;
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

  return null;
};

export const many_data_types = async dbClient => {
  const tableName = "many_data_types";

  await dbClient.schema.dropTableIfExists(tableName);

  await dbClient.schema.createTable(tableName, table => {
    table.increments("id").primary();
    table.uuid("uuid");

    table.integer("integer");
    table.integer("integerUnsigned").unsigned();
    table.tinyint("tinyint");
    table.tinyint("tinyint1", 1);
    table.smallint("smallint");
    table.mediumint("mediumint");
    table.bigInteger("bigint");

    table.string("string");
    table.text("text");

    table.float("float");
    table.double("double");
    table.decimal("decimal");

    table.boolean("boolean");

    table.date("date");
    table.dateTime("datetime", { useTz: false });
    table.dateTime("datetimeTZ", { useTz: true });
    table.time("time");
    table.timestamp("timestamp", { useTz: false });
    table.timestamp("timestampTZ", { useTz: true });

    table.json("json");
    table.jsonb("jsonb");

    table.enu("enum", ["alpha", "beta", "gamma", "delta"]);

    table.binary("binary");
  });

  await dbClient(tableName).insert(many_data_types_rows);
  return null;
};

export const uuid_pk_table = async dbClient => {
  const tableName = "uuid_pk_table";

  await dbClient.schema.dropTableIfExists(tableName);

  await dbClient.schema.createTable(tableName, table => {
    table.uuid("id").primary();
    table.string("name");
  });

  await dbClient(tableName).insert([
    { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", name: "Duck" },
    { id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12", name: "Rabbit" },
  ]);

  return null;
};

export const composite_pk_table = async dbClient => {
  const tableName = "composite_pk_table";

  await dbClient.schema.dropTableIfExists(tableName);

  await dbClient.schema.createTable(tableName, table => {
    table.integer("id1");
    table.string("id2");
    table.string("name");
    table.integer("score");
    table.primary(["id1", "id2"]);
  });

  await dbClient(tableName).insert([
    { id1: 1, id2: "alpha", name: "Duck", score: 10 },
    { id1: 1, id2: "beta", name: "Horse", score: 20 },
    { id1: 2, id2: "alpha", name: "Cow", score: 30 },
    { id1: 2, id2: "beta", name: "Pig", score: 40 },
    { id1: 3, id2: "alpha", name: "Chicken", score: 50 },
    { id1: 3, id2: "beta", name: "Rabbit", score: 60 },
  ]);

  return null;
};

export const no_pk_table = async dbClient => {
  const tableName = "no_pk_table";

  await dbClient.schema.dropTableIfExists(tableName);

  await dbClient.schema.createTable(tableName, table => {
    table.string("name");
    table.integer("score");
  });

  await dbClient(tableName).insert([
    { name: "Duck", score: 10 },
    { name: "Horse", score: 20 },
    { name: "Cow", score: 30 },
    { name: "Pig", score: 40 },
    { name: "Chicken", score: 50 },
    { name: "Rabbit", score: 60 },
  ]);

  return null;
};

export const multi_schema = async dbClient => {
  const schemas = {
    Domestic: [
      "Animals",
      [
        { name: "Duck", score: 10 },
        { name: "Horse", score: 20 },
        { name: "Cow", score: 30 },
      ],
    ],
    Wild: [
      "Animals",
      [
        { name: "Snake", score: 10 },
        { name: "Lion", score: 20 },
        { name: "Elephant", score: 30 },
      ],
    ],
  };

  Object.entries(schemas).forEach(async ([schemaName, details]) => {
    const [table, rows] = details;
    await dbClient.schema.createSchemaIfNotExists(schemaName);
    await dbClient.schema.withSchema(schemaName).dropTableIfExists(table);

    await dbClient.schema.withSchema(schemaName).createTable(table, t => {
      t.string("name");
      t.integer("score");
    });

    await dbClient(`${schemaName}.${table}`).insert(rows);
  });

  return schemas;
};

export const many_schemas = async dbClient => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const schemas = Object.fromEntries(
    alphabet.map(letter => {
      const key = `Schema ${letter}`;
      const value = [
        "Animals",
        [
          { name: "Duck", score: 10 },
          { name: "Horse", score: 20 },
          { name: "Cow", score: 30 },
        ],
      ];
      return [key, value];
    }),
  );

  Object.entries(schemas).forEach(async ([schemaName, details]) => {
    const [table, rows] = details;
    await dbClient.schema.createSchemaIfNotExists(schemaName);
    await dbClient.schema.withSchema(schemaName).dropTableIfExists(table);

    await dbClient.schema.withSchema(schemaName).createTable(table, t => {
      t.string("name");
      t.integer("score");
    });

    await dbClient(`${schemaName}.${table}`).insert(rows);
  });

  return schemas;
};
