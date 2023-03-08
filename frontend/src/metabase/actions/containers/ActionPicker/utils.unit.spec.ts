import { createMockQueryAction } from "metabase-types/api/mocks";

import { groupActionsByModelId, sortGroupedActions } from "./utils";

const testActions = [
  createMockQueryAction({ id: 2, name: "Bear Action", model_id: 1 }),
  createMockQueryAction({ id: 1, name: "Aardvark Action", model_id: 1 }),
  createMockQueryAction({ id: 4, name: "Dog Action", model_id: 2 }),
  createMockQueryAction({ id: 3, name: "Cat Action", model_id: 2 }),
  createMockQueryAction({ id: 5, name: "Elephant Action", model_id: 3 }),
];

describe("Actions > ActionPicker", () => {
  describe("groupActionsByModelId", () => {
    it("should group actions by model id", () => {
      const groupedActions = groupActionsByModelId(testActions);

      expect(groupedActions).toEqual({
        1: [testActions[0], testActions[1]],
        2: [testActions[2], testActions[3]],
        3: [testActions[4]],
      });
    });

    it("should return an empty object if no actions are passed", () => {
      const groupedActions = groupActionsByModelId();

      expect(groupedActions).toEqual({});
    });
  });

  describe("sortGroupedActions", () => {
    it("should sort actions by name within each model", () => {
      const groupedActions = groupActionsByModelId(testActions);
      const sortedGroupedActions = sortGroupedActions(groupedActions);

      expect(sortedGroupedActions).toEqual({
        1: [testActions[1], testActions[0]],
        2: [testActions[3], testActions[2]],
        3: [testActions[4]],
      });
    });
  });
});
