import { updateIn } from "icepick";
import { createEntity } from "metabase/lib/entities";
import { MetabaseApi } from "metabase/services";

import { SchemaSchema } from "metabase/schema";
import Questions from "metabase/entities/questions";
import {
  generateSchemaId,
  parseSchemaId,
} from "metabase-lib/metadata/utils/schema";
import {
  getCollectionVirtualSchemaId,
  getQuestionVirtualTableId,
} from "metabase-lib/metadata/utils/saved-questions";

// This is a weird entity because we don't have actual schema objects

export default createEntity({
  name: "schemas",
  schema: SchemaSchema,
  api: {
    list: async ({ dbId, getAll = false, ...args }) => {
      if (!dbId) {
        throw new Error("Schemas can only be listed for a particular dbId");
      }
      const schemaNames = await (getAll
        ? MetabaseApi.db_syncable_schemas({ dbId, ...args }) // includes empty schema
        : MetabaseApi.db_schemas({ dbId, ...args }));

      return schemaNames.map(schemaName => ({
        // NOTE: needs unique IDs for entities to work correctly
        id: generateSchemaId(dbId, schemaName),
        name: schemaName,
        database: { id: dbId },
      }));
    },
    get: async ({ id, ...args }) => {
      const [dbId, schemaName, opts] = parseSchemaId(id);
      if (!dbId || schemaName === undefined) {
        throw new Error("Schemas ID is of the form dbId:schemaName");
      }
      const tables = opts?.isDatasets
        ? await MetabaseApi.db_virtual_dataset_tables({
            dbId,
            schemaName,
            ...args,
          })
        : await MetabaseApi.db_schema_tables({ dbId, schemaName, ...args });
      return {
        id,
        name: schemaName,
        tables: tables,
        database: { id: dbId },
      };
    },
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.CREATE && !error) {
      const { question, status, data } = payload;
      if (question) {
        const schema = getCollectionVirtualSchemaId(question.collection, {
          isDatasets: question.dataset,
        });
        if (!state[schema]) {
          return state;
        }
        const virtualQuestionId = getQuestionVirtualTableId(question.id);
        return updateIn(state, [schema, "tables"], tables =>
          addTableAvoidingDuplicates(tables, virtualQuestionId),
        );
      }
      // IF there is no question
      // AND if the request has failed,
      // throw the error message to display
      else if (status === 400 && data?.message) {
        throw new Error(data.message);
      }
    }

    if (type === Questions.actionTypes.UPDATE && !error) {
      const { question } = payload;
      const schemaId = getCollectionVirtualSchemaId(question.collection, {
        isDatasets: question.dataset,
      });

      const virtualQuestionId = getQuestionVirtualTableId(question.id);
      const previousSchemaContainingTheQuestion =
        getPreviousSchemaContainingTheQuestion(
          state,
          schemaId,
          virtualQuestionId,
        );

      if (previousSchemaContainingTheQuestion) {
        state = removeVirtualQuestionFromSchema(
          state,
          previousSchemaContainingTheQuestion.id,
          virtualQuestionId,
        );
      }

      if (!state[schemaId]) {
        return state;
      }

      return updateIn(state, [schemaId, "tables"], tables => {
        if (!tables) {
          return tables;
        }

        if (question.archived) {
          return tables.filter(id => id !== virtualQuestionId);
        }
        return addTableAvoidingDuplicates(tables, virtualQuestionId);
      });
    }

    return state;
  },
});

function getPreviousSchemaContainingTheQuestion(
  state,
  schemaId,
  virtualQuestionId,
) {
  return Object.values(state).find(schema => {
    if (schema.id === schemaId) {
      return false;
    }

    return (schema.tables || []).includes(virtualQuestionId);
  });
}

function removeVirtualQuestionFromSchema(state, schemaId, virtualQuestionId) {
  return updateIn(state, [schemaId, "tables"], tables =>
    tables.filter(tableId => tableId !== virtualQuestionId),
  );
}

function addTableAvoidingDuplicates(tables, tableId) {
  if (!Array.isArray(tables)) {
    return [tableId];
  }
  return tables.includes(tableId) ? tables : [...tables, tableId];
}
