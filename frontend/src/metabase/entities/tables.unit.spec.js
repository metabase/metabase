import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import {
  setupTableQueryMetadataEndpoint,
  setupUnauthorizedFieldEndpoint,
} from "__support__/server-mocks";
import { Api } from "metabase/api";
import Questions from "metabase/entities/questions";
import Tables, { FETCH_TABLE_METADATA } from "metabase/entities/tables";
import { mainReducers } from "metabase/reducers-main";
import { getMetadata } from "metabase/selectors/metadata";
import { convertSavedQuestionToVirtualTable } from "metabase-lib/v1/metadata/utils/saved-questions";
import { createMockField, createMockTable } from "metabase-types/api/mocks";

const TABLE_ID = 1;
const FK_TARGET_FIELD_ID = 3;

const FK_FIELD = createMockField({
  id: 1,
  table_id: TABLE_ID,
  name: "a",
  // This field is a foreign key to a table that the user doesn't have access to
  semantic_type: "type/FK",
  fk_target_field_id: FK_TARGET_FIELD_ID,
  target: undefined,
});

const TABLE_A = createMockTable({
  id: TABLE_ID,
  fields: [FK_FIELD],
});

describe("table entity", () => {
  describe("fetchMetadataAndForeignTables", () => {
    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it("resolves and loads the table even when a foreign key target field is forbidden", async () => {
      setupTableQueryMetadataEndpoint(TABLE_A);
      setupUnauthorizedFieldEndpoint(
        createMockField({ id: FK_TARGET_FIELD_ID }),
      );

      const store = getStore(
        {
          ...mainReducers,
          [Api.reducerPath]: Api.reducer,
        },
        {},
        [Api.middleware],
      );

      await expect(
        store.dispatch(
          Tables.actions.fetchMetadataAndForeignTables({ id: TABLE_ID }),
        ),
      ).resolves.toMatchObject({ type: FETCH_TABLE_METADATA });

      expect(
        fetchMock.callHistory.called(`path:/api/field/${FK_TARGET_FIELD_ID}`),
      ).toBe(true);

      const table = getMetadata(store.getState()).table(TABLE_ID);
      expect(table).toBeDefined();
    });
  });

  describe("saved questions | reducer", () => {
    function getQuestion({
      id = 5,
      name = "Q1",
      collection = null,
      dataset_query = { database: 1 },
      archived = false,
    } = {}) {
      const question = {
        id,
        name,
        collection,
        dataset_query,
        archived,
      };
      return {
        question,
        virtualTable: convertSavedQuestionToVirtualTable(question),
      };
    }

    function getCreateAction(question) {
      return {
        type: Questions.actionTypes.CREATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    function getUpdateAction(question) {
      return {
        type: Questions.actionTypes.UPDATE,
        payload: {
          question,
          object: question,
        },
      };
    }

    it("should add saved question to tables state", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = Tables.reducer({}, getCreateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });

    it("should remove saved question from state when archived", () => {
      const { question, virtualTable } = getQuestion({ archived: true });

      const nextState = Tables.reducer(
        {
          card__123: { foo: "bar" },
          [virtualTable.id]: virtualTable,
        },
        getUpdateAction(question),
      );

      expect(nextState).toEqual({ card__123: { foo: "bar" } });
    });

    it("should add saved question to tables state when unarchived", () => {
      const { question, virtualTable } = getQuestion();

      const nextState = Tables.reducer({}, getUpdateAction(question));

      expect(nextState).toEqual({
        [virtualTable.id]: virtualTable,
      });
    });
  });
});
