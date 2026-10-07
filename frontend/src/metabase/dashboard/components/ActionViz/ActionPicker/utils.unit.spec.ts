import {
  createMockImplicitQueryAction,
  createMockQueryAction,
} from "metabase-types/api/mocks";

import { getSortedActionsWithoutModel, sortAndGroupActions } from "./utils";

const testActions = [
  createMockImplicitQueryAction({ id: 2, name: "Bear Action", model_id: 1 }),
  createMockImplicitQueryAction({ id: 4, name: "Dog Action", model_id: 2 }),
  createMockImplicitQueryAction({ id: 3, name: "Cat Action", model_id: 2 }),
  createMockImplicitQueryAction({
    id: 5,
    name: "Elephant Action",
    model_id: 3,
  }),
  createMockImplicitQueryAction({
    id: 1,
    name: "aardvark Action",
    model_id: 1,
  }),
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

  describe("getSortedActionsWithoutModel", () => {
    it("should return only the actions without a model, sorted by name", () => {
      const zebraAction = createMockQueryAction({ id: 6, name: "Zebra" });
      const antAction = createMockQueryAction({ id: 7, name: "ant" });

      expect(
        getSortedActionsWithoutModel([...testActions, zebraAction, antAction]),
      ).toEqual([antAction, zebraAction]);
    });
  });
});
