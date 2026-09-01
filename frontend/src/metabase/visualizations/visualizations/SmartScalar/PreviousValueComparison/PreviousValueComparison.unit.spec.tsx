import { innerText } from "./PreviousValueComparison";

describe("innerText", () => {
  it("returns an empty string for null, undefined, and booleans", () => {
    expect(innerText(null)).toBe("");
    expect(innerText(undefined)).toBe("");
    expect(innerText(true)).toBe("");
    expect(innerText(false)).toBe("");
  });

  it("returns strings as-is", () => {
    expect(innerText("vs. previous month")).toBe("vs. previous month");
    expect(innerText("")).toBe("");
  });

  it("stringifies numbers", () => {
    expect(innerText(42)).toBe("42");
    expect(innerText(0)).toBe("0");
    expect(innerText(-1.5)).toBe("-1.5");
  });

  it("concatenates arrays without a separator", () => {
    expect(innerText(["vs. ", 42, "%"])).toBe("vs. 42%");
  });

  it("extracts text from an element's children", () => {
    expect(innerText(<span>vs. previous month</span>)).toBe(
      "vs. previous month",
    );
  });

  it("recurses through nested elements, arrays, and fragments", () => {
    expect(
      innerText(
        <div>
          <span>vs. </span>
          <>
            {["Jan", " 1"]}
            <b>{2024}</b>
          </>
        </div>,
      ),
    ).toBe("vs. Jan 12024");
  });

  it("returns an empty string for an element without children", () => {
    expect(innerText(<hr />)).toBe("");
  });

  it("skips non-text children like booleans from conditional rendering", () => {
    expect(
      innerText(
        <div>
          {false}before{null}after
        </div>,
      ),
    ).toBe("beforeafter");
  });
});
