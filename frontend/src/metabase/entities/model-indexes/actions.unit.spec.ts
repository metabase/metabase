import fetchMock from "fetch-mock";

import { getStore } from "__support__/entities-store";
import { setupModelIndexEndpoints } from "__support__/server-mocks";
import { Api } from "metabase/api";
import Question from "metabase-lib/v1/Question";
import type { Field, FieldReference, ModelIndex } from "metabase-types/api";
import {
  createMockField as createBaseMockField,
  createMockCard,
  createMockModelIndex,
} from "metabase-types/api/mocks";

import type { FieldWithMaybeIndex } from "./actions";
import { cleanIndexFlags, updateModelIndexes } from "./actions";

const createMockField = (options?: Partial<FieldWithMaybeIndex>): Field => {
  return createBaseMockField(options as Partial<Field>);
};

const createModelWithResultMetadata = (fields: Field[]) => {
  return new Question(
    createMockCard({ result_metadata: fields, type: "model" }),
  );
};

const setup = () => {
  const store = getStore({ [Api.reducerPath]: Api.reducer }, {}, [
    Api.middleware,
  ]);

  return {
    dispatch: store.dispatch,
  };
};

describe("Entities > model-indexes > actions", () => {
  describe("cleanIndexFlags", () => {
    it("should remove should_index flag from fields", () => {
      const model = createModelWithResultMetadata([
        createMockField({ should_index: true }),
        createMockField({ should_index: false }),
        createMockField(),
      ]);

      const cleanedFields = cleanIndexFlags(model.getResultMetadata());

      cleanedFields.forEach((field: any) => {
        expect(field?.should_index).toBeUndefined();
      });
    });

    it("should not mutate the original question", () => {
      const model = createModelWithResultMetadata([
        createMockField({ should_index: true }),
        createMockField({ should_index: true }),
      ]);

      cleanIndexFlags(model.getResultMetadata());

      model.getResultMetadata().forEach((field: any) => {
        expect(field?.should_index).toBe(true);
      });
    });
  });

  describe("updateModelIndexes", () => {
    it("should not do anything if there are no fields with should_index flag", async () => {
      const model = createModelWithResultMetadata([
        createMockField(),
        createMockField(),
      ]);

      const { dispatch } = setup();
      await updateModelIndexes(model)(dispatch);

      const calls = fetchMock.calls();

      // No API calls to fetch model indexes
      expect(calls).toHaveLength(0);
    });

    it("should make a POST call for a newly-added index field", async () => {
      const pkFieldRef: FieldReference = ["field", 1, null];
      const indexFieldRef: FieldReference = ["field", 2, null];

      const model = createModelWithResultMetadata([
        createMockField({ field_ref: pkFieldRef, semantic_type: "type/PK" }),
        createMockField({ should_index: true, field_ref: indexFieldRef }),
        createMockField(),
      ]);

      setupModelIndexEndpoints(model.id(), []);

      const { dispatch } = setup();

      await updateModelIndexes(model)(dispatch);

      const createCalls = await fetchMock.calls("createModelIndex");

      expect(createCalls).toHaveLength(1);

      const [, options] = createCalls[0];

      expect(options?.method).toBe("POST");
      // @ts-expect-error ???
      const body = JSON.parse(await options?.body) as Partial<ModelIndex>;
      expect(body.model_id).toBe(model.id());
      expect(body.pk_ref).toEqual(pkFieldRef);
      expect(body.value_ref).toEqual(indexFieldRef);
    });

    it("should make a DELETE call to remove an index field", async () => {
      const pkFieldRef: FieldReference = ["field", 1, null];
      const indexFieldRef: FieldReference = ["field", 2, null];

      const model = createModelWithResultMetadata([
        createMockField({ field_ref: pkFieldRef, semantic_type: "type/PK" }),
        createMockField({ should_index: false, field_ref: indexFieldRef }),
        createMockField(),
      ]);

      const existingModelIndex = createMockModelIndex({
        id: 99,
        model_id: 1,
        value_ref: indexFieldRef,
      });

      setupModelIndexEndpoints(1, [existingModelIndex]);

      const { dispatch } = setup();

      await updateModelIndexes(model)(dispatch);

      const deleteCalls = fetchMock.calls("deleteModelIndex");

      expect(deleteCalls).toHaveLength(1);

      const [url, options] = deleteCalls[0];

      expect(url).toContain("/api/model-index/99");
      expect(options?.method).toBe("DELETE");
    });

    it("should not create a new index if there is already one for the field", async () => {
      const pkFieldRef: FieldReference = ["field", 1, null];
      const indexFieldRef: FieldReference = ["field", 2, null];

      const model = createModelWithResultMetadata([
        createMockField({ field_ref: pkFieldRef, semantic_type: "type/PK" }),
        createMockField({ should_index: true, field_ref: indexFieldRef }),
        createMockField(),
      ]);

      const existingModelIndex = createMockModelIndex({
        id: 99,
        value_ref: indexFieldRef,
      });

      setupModelIndexEndpoints(model.id(), [existingModelIndex]);

      const { dispatch } = setup();

      await updateModelIndexes(model)(dispatch);

      const fetchCalls = await fetchMock.calls(`getModelIndexes-${model.id()}`);
      const createCalls = await fetchMock.calls("createModelIndex");

      // no calls to Create
      expect(createCalls).toHaveLength(0);
      // Made a call to fetch
      expect(fetchCalls).toHaveLength(1);
    });

    it("should not delete an index if there is no index for the field", async () => {
      const pkFieldRef: FieldReference = ["field", 1, null];
      const indexFieldRef: FieldReference = ["field", 2, null];

      const model = createModelWithResultMetadata([
        createMockField({ field_ref: pkFieldRef, semantic_type: "type/PK" }),
        createMockField({ should_index: false, field_ref: indexFieldRef }),
        createMockField(),
      ]);

      setupModelIndexEndpoints(model.id(), []);

      const { dispatch } = setup();

      await updateModelIndexes(model)(dispatch);

      const fetchCalls = await fetchMock.calls(`getModelIndexes-${model.id()}`);
      const deleteCalls = fetchMock.calls("deleteModelIndex");

      // Expect 1 fetch for model indexes
      expect(fetchCalls).toHaveLength(1);

      //Expect no calls to delete
      expect(deleteCalls).toHaveLength(0);
    });
  });
});
