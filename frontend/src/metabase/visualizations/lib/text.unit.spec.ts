import { measureTextWidth as measureDynamic } from "metabase/lib/measure-text";
import { measureTextWidth as measureStatic } from "metabase/static-viz/lib/text";

import type { FontStyle } from "../shared/types/measure-text";

import { truncateText } from "./text";

const fontStyle: FontStyle = {
  size: 11,
  weight: 400,
  family: "Lato",
};

describe("truncateText", () => {
  const staticFn = (text: string, style: FontStyle) =>
    measureStatic(text, +style.size, +style.weight);

  const dynamicFn = (text: string, style: FontStyle) =>
    measureDynamic(text, style);

  beforeEach(() => {
    jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.innerHTML.length * 6;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should not truncate text with ellipses if there is no overflow", () => {
    expect(truncateText("John Doe", 48, dynamicFn, fontStyle)).toBe("John Doe");

    expect(truncateText("John Doe", 48, staticFn, fontStyle)).toBe("John Doe");
  });

  it("should truncate text with ellipses if there is overflow", () => {
    expect(truncateText("John Doe", 40, dynamicFn, fontStyle)).toBe("John…");

    expect(truncateText("John Doe", 40, staticFn, fontStyle)).toBe("John…");
  });

  it("should use ellipses in case there is no space for text at all", () => {
    expect(truncateText("John Doe", 0, dynamicFn, fontStyle)).toBe("…");

    expect(truncateText("John Doe", 0, staticFn, fontStyle)).toBe("…");
  });
});
