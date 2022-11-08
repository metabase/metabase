import { entityTypeForModel, entityTypeForObject } from "./schema";

describe("schemas", () => {
  const MODEL_ENTITY_TYPE = [
    { model: "card", entityType: "questions" },
    { model: "dataset", entityType: "questions" },
    { model: "dashboard", entityType: "dashboards" },
    { model: "pulse", entityType: "pulses" },
    { model: "collection", entityType: "collections" },
    { model: "segment", entityType: "segments" },
    { model: "metric", entityType: "metrics" },
    { model: "snippet", entityType: "snippets" },
    { model: "snippetCollection", entityType: "snippetCollections" },
  ];

  describe("entityTypeForModel", () => {
    MODEL_ENTITY_TYPE.forEach(testCase => {
      const { model, entityType } = testCase;
      it(`returns "${entityType}" for "${model}" model`, () => {
        expect(entityTypeForModel(model)).toBe(entityType);
      });
    });
  });

  describe("entityTypeForObject", () => {
    MODEL_ENTITY_TYPE.forEach(testCase => {
      const { model, entityType } = testCase;
      it(`returns "${entityType}" for "${model}" model`, () => {
        expect(entityTypeForObject({ model })).toBe(entityType);
      });
    });

    it(`handles undefined object`, () => {
      expect(entityTypeForObject()).toBe(undefined);
    });
  });
});
