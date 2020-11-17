import { createEntity } from "metabase/lib/entities";

import { GET } from "metabase/lib/api";

import { SchemaSchema, generateSchemaId, parseSchemaId } from "metabase/schema";

// This is a weird entity because we don't have actual schema objects

const listDastabaseSchemas = GET("/api/database/:dbId/schemas");
const getSchemaTables = GET("/api/database/:dbId/schema/:schemaName");

export default createEntity({
  name: "schemas",
  schema: SchemaSchema,
  api: {
    list: async ({ dbId }) => {
      if (!dbId) {
        throw new Error("Schemas can only be listed for a particular dbId");
      }
      const schemaNames = await listDastabaseSchemas({ dbId });
      return schemaNames.map(schemaName => ({
        // NOTE: needs unqiue IDs for entities to work correctly
        id: generateSchemaId(dbId, schemaName),
        name: schemaName,
        database: { id: dbId },
      }));
    },
    get: async ({ id }) => {
      const [dbId, schemaName] = parseSchemaId(id);
      if (!dbId || schemaName === undefined) {
        throw new Error("Schemas ID is of the form dbId:schemaName");
      }
      const tables = await getSchemaTables({ dbId, schemaName });
      return {
        id,
        name: schemaName,
        tables: tables,
        database: { id: dbId },
      };
    },
  },
});
