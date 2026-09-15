import { createStaticRenderingContext } from "./rendering-context";

describe("createStaticRenderingContext", () => {
  it("marks the context as static so charts can drop hover-only affordances", () => {
    expect(createStaticRenderingContext().isStatic).toBe(true);
  });
});
