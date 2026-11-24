import { pill } from "../test-utils";

import { createTestEditor } from "./test-editor";

const A = pill("A");
const B = pill("B");

const getHiddenCount = (...stages: Parameters<typeof createTestEditor>) =>
  createTestEditor(...stages).editor.view.dom.querySelectorAll("[data-hidden]")
    .length;

describe("hidden then", () => {
  it("hides a then with no row filters before it", () => {
    expect(getHiddenCount([], [A])).toBe(1);
  });

  it("shows a then after a row filter", () => {
    expect(getHiddenCount([A], [B])).toBe(0);
  });

  it("hides every then before the first filter", () => {
    expect(getHiddenCount([], [], [A])).toBe(2);
  });

  it("hides the then of an empty stage", () => {
    expect(getHiddenCount([A], [], [B])).toBe(1);
  });

  it("hides the then of an empty last stage", () => {
    expect(getHiddenCount([A], [])).toBe(1);
  });
});
