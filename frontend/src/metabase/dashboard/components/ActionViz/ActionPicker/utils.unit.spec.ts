import { createMockQueryAction } from "metabase-types/api/mocks";

import { sortAndGroupActions } from "./utils";

const testActions = [
  createMockQueryAction({ id: 2, name: "Bear Action", model_id: 1 }),
  createMockQueryAction({ id: 4, name: "Dog Action", model_id: 2 }),
  createMockQueryAction({ id: 3, name: "Cat Action", model_id: 2 }),
  createMockQueryAction({ id: 5, name: "Elephant Action", model_id: 3 }),
  createMockQueryAction({ id: 1, name: "aardvark Action", model_id: 1 }),
];

describe("Actions > ActionPicker", () => {
  describe("sortAndGroupActions", () => {
    it("should sort actions by name within each model", () => {
      const sortedGroupedActions = sortAndGroupActions(testActions);

      expect(sortedGroupedActions).toEqual({
        1: [testActions[4], testActions[0]],
        2: [testActions[2], testActions[1]],
        3: [testActions[3]],
      });
    });
  });
});
