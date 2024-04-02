import { assocIn, updateIn } from "icepick";

import { databaseApi } from "metabase/api";
import Questions from "metabase/entities/questions";
import { createEntity, entityCompatibleQuery } from "metabase/lib/entities";
import { SchemaSchema } from "metabase/schema";
import { getMetadata } from "metabase/selectors/metadata";
import {
  getCollectionVirtualSchemaId,
  getCollectionVirtualSchemaName,
  getQuestionVirtualTableId,
  SAVED_QUESTIONS_VIRTUAL_DB_ID,
} from "metabase-lib/v1/metadata/utils/saved-questions";
import {
  generateSchemaId,
  parseSchemaId,
} from "metabase-lib/v1/metadata/utils/schema";

// This is a weird entity because we don't have actual schema objects

/**
 * @deprecated use "metabase/api" instead
 */
export default createEntity({
  name: "schemas",
  schema: SchemaSchema,
  api: {
    list: async ({ dbId, getAll = false, ...args }, dispatch) => {
      if (!dbId) {
        throw new Error("Schemas can only be listed for a particular dbId");
      }
      const schemaNames = getAll
        ? await entityCompatibleQuery(
            dbId,
            dispatch,
            databaseApi.endpoints.listSyncableDatabaseSchemas, // includes empty schema
          )
        : await entityCompatibleQuery(
            { id: dbId, ...args },
            dispatch,
            databaseApi.endpoints.listDatabaseSchemas,
          );

      return schemaNames.map(schemaName => ({
        // NOTE: needs unique IDs for entities to work correctly
        id: generateSchemaId(dbId, schemaName),
        name: schemaName,
        database: { id: dbId },
      }));
    },
    get: async ({ id, ...args }, options, dispatch) => {
      const [dbId, schemaName, opts] = parseSchemaId(id);
      if (!dbId || schemaName === undefined) {
        throw new Error("Schemas ID is of the form dbId:schemaName");
      }
      const tables = opts?.isDatasets
        ? await entityCompatibleQuery(
            {
              id: dbId,
              schema: schemaName,
              ...args,
            },
            dispatch,
            databaseApi.endpoints.listVirtualDatabaseTables,
          )
        : await entityCompatibleQuery(
            { id: dbId, schema: schemaName, ...args },
            dispatch,
            databaseApi.endpoints.listDatabaseSchemaTables,
          );
      return {
        id,
        name: schemaName,
        tables: tables,
        database: { id: dbId },
      };
    },
  },

  selectors: {
    getObject: (state, { entityId }) => getMetadata(state).schema(entityId),
  },

  objectSelectors: {
    getIcon: () => ({ name: "folder" }),
  },

  reducer: (state = {}, { type, payload, error }) => {
    if (type === Questions.actionTypes.CREATE && !error) {
      const { question, status, data } = payload;
      if (question) {
        const schema = getCollectionVirtualSchemaId(question.collection, {
          isDatasets: question.type === "model",
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
      const { question: card } = payload;
      const virtualSchemaId = getCollectionVirtualSchemaId(card.collection, {
        isDatasets: card.type === "model",
      });
      const virtualSchemaName = getCollectionVirtualSchemaName(card.collection);
      const virtualQuestionId = getQuestionVirtualTableId(card.id);
      const previousSchemaContainingTheQuestion =
        getPreviousSchemaContainingTheQuestion(
          state,
          virtualSchemaId,
          virtualQuestionId,
        );

      if (previousSchemaContainingTheQuestion) {
        state = removeVirtualQuestionFromSchema(
          state,
          previousSchemaContainingTheQuestion.id,
          virtualQuestionId,
        );
      }

      if (!state[virtualSchemaId]) {
        state = assocIn(state, [virtualSchemaId], {
          id: virtualSchemaId,
          name: virtualSchemaName,
          database: SAVED_QUESTIONS_VIRTUAL_DB_ID,
        });
      }

      return updateIn(state, [virtualSchemaId, "tables"], tables => {
        if (!tables) {
          return tables;
        }

        if (card.archived) {
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
