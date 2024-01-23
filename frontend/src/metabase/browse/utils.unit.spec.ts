import { sortModels } from "./utils";

describe("utils", () => {
  describe("sortModels", () => {
    it("should sort by collection name, case insensitively", () => {
      const modelA = {
        collection: { name: "An ALPHABETICALLY early collection", id: 1 },
        name: "Model",
        id: 1,
      };
      const modelB = {
        collection: { name: "an alphabetically EARLY collection", id: 2 },
        name: "Model",
        id: 2,
      };
      const modelC = {
        collection: { name: "But another collection", id: 3 },
        name: "Model",
        id: 3,
      };

      const models = [modelC, modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB, modelC]);
    });

    it("should sort by collection name, if the model names are the same", () => {
      const modelA = {
        collection: { name: "Collection A", id: 1 },
        name: "Model",
        id: 1,
      };
      const modelB = {
        collection: { name: "Collection B", id: 2 },
        name: "Model",
        id: 2,
      };

      const models = [modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB]);
    });

    it("should sort by the model name, if the collections have the same names and ids", () => {
      const modelA = {
        collection: { name: "A nice collection", id: 1 },
        name: "Model A",
        id: 1,
      };
      const modelB = {
        collection: { name: "A nice collection", id: 1 },
        name: "Model B",
        id: 2,
      };

      const models = [modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB]);
    });

    it("should handle models without collections", () => {
      const modelA = { name: "Model A", id: 1 };
      const modelB = { name: "Model B", id: 2 };
      const models = [modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB]);
    });

    it("should handle models without names", () => {
      const modelA = {
        collection: { name: "A nice collection", id: 1 },
        id: 1,
      };
      const modelB = {
        collection: { name: "A nice collection", id: 2 },
        id: 2,
      };
      const models = [modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB]);
    });

    it("should handle models without names or collection names", () => {
      const modelA = { collection: { id: 1 }, id: 1 };
      const modelB = { collection: { id: 2 }, id: 2 };
      const modelC = {};
      const models = [modelC, modelB, modelA];
      models.sort(sortModels);
      expect(models).toEqual([modelA, modelB, modelC]);
    });
  });
});
