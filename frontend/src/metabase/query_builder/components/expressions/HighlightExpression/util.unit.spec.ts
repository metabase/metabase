import { highlight } from "./utils";

// By default css modules dont return classes in unit tests.
// Since we need the classnames for this test, we mock the module.
jest.mock("./HighlightExpression.module.css", () => {
  const { tags } = jest.requireActual("@lezer/highlight");
  return Object.fromEntries(Object.keys(tags).map((name) => [name, name]));
});

describe("highlight", () => {
  it("should highlight a simple expression", () => {
    const html = highlight(`if([User Id] > 10, "YES", 42 + 1e7)`);
    expect(html).toBe(
      '<span class="variableName">if</span><span class="paren">(</span><span class="processingInstruction">[User Id]</span> <span class="compareOperator">></span> <span class="number">10</span>, <span class="string">"YES"</span>, <span class="number">42</span> <span class="arithmeticOperator">+</span> <span class="number">1e7</span><span class="paren">)</span>',
    );
  });
});
