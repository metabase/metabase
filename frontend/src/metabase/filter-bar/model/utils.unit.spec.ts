import { THEN_1, THEN_2, pill } from "../test-utils";

import { getStageIndex } from "./utils";

const A = pill("A");
const B = pill("B");
const C = pill("C");

describe("getStageIndex", () => {
  it.each<[number, number]>([
    [0, 0],
    [1, 0],
    [2, 1],
  ])("token %i is in stage %i", (index, stageIndex) => {
    expect(getStageIndex([A, THEN_1, B, THEN_2, C], index)).toBe(stageIndex);
  });

  it("takes the stage from the then, even when stages in between are empty", () => {
    expect(getStageIndex([A, THEN_2, C], 2)).toBe(2);
  });
});
