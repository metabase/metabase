// Database 2 contains an imaginary multi-schema database (like Redshift for instance)
// Database 3 contains an imaginary database which doesn't have any schemas (like MySQL)
// (A single-schema database was originally Database 1 but it got removed as testing against it felt redundant)

export const normalizedMetadata = {
  metrics: {},
  segments: {},
  databases: {
    "2": {
      name: "Imaginary Multi-Schema Dataset",
      tables: [
        // In schema_1
        5,
        6,
        // In schema_2
        7,
        8,
        9,
      ],
      id: 2,
    },
    "3": {
      name: "Imaginary Schemaless Dataset",
      tables: [10, 11, 12, 13],
      id: 3,
    },
  },
  schemas: {
    "2:schema_1": {
      id: "2:schema_1",
      name: "schema_1",
      database: 2,
    },
    "2:schema_2": {
      id: "2:schema_2",
      name: "schema_2",
      database: 2,
    },
    "3:": {
      id: "3:",
      name: null,
      database: 3,
    },
  },
  tables: {
    "5": {
      schema: "2:schema_1",
      schema_name: "schema_1",
      name: "Avian Singles Messages",
      id: 5,
      db_id: 2,
    },
    "6": {
      schema: "2:schema_1",
      schema_name: "schema_1",
      name: "Avian Singles Users",
      id: 6,
      db_id: 2,
    },
    "7": {
      schema: "2:schema_2",
      schema_name: "schema_2",
      name: "Tupac Sightings Sightings",
      id: 7,
      db_id: 2,
    },
    "8": {
      schema: "2:schema_2",
      schema_name: "schema_2",
      name: "Tupac Sightings Categories",
      id: 8,
      db_id: 2,
    },
    "9": {
      schema: "2:schema_2",
      schema_name: "schema_2",
      name: "Tupac Sightings Cities",
      id: 9,
      db_id: 2,
    },
    "10": {
      schema: "3:",
      schema_name: null,
      name: "Badminton Men's Double Results",
      id: 10,
      db_id: 3,
    },
    "11": {
      schema: "3:",
      schema_name: null,
      name: "Badminton Mixed Double Results",
      id: 11,
      db_id: 3,
    },
    "12": {
      schema: "3:",
      schema_name: null,
      name: "Badminton Women's Singles Results",
      id: 12,
      db_id: 3,
    },
    "13": {
      schema: "3:",
      schema_name: null,
      name: "Badminton Mixed Singles Results",
      id: 13,
      db_id: 3,
    },
  },
  fields: {
    /* stripped out */
  },
  revisions: {},
  databasesList: [2, 3],

  groups: {
    "1": {
      id: 1,
      name: "Group starting with full access",
    },
    "2": {
      id: 2,
      name: "Group starting with no access at all",
    },
  },
  groups_list: [1, 2],
};
