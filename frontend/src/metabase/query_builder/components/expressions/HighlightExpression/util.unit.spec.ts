import { highlight } from "./util";

// By default css modules dont return classes in unit tests.
// Since we need the classnames for this test, we mock the module.
jest.mock("./HighlightExpression.module.css", () =>
  Object.fromEntries(
    [
      "keyword",
      "name",
      "variable",
      "function",
      "variableName",
      "constant",
      "typeName",
      "string",
      "number",
      "bool",
      "comment",
      "lineComment",
      "blockComment",
      "squareBracket",
      "callExpression",
      "processingInstruction",
      "logicOperator",
      "arithmeticOperator",
      "compareOperator",
      "escape",
    ].map(name => [name, name]),
  ),
);

describe("highlight", () => {
  it("should highlight a simple expression", () => {
    const html = highlight(`if([User Id] > 10, "YES", 42 + 1e7)`);
    expect(html).toBe(
      `<span class="function variableName">if</span>(<span class="processingInstruction">[User Id]</span> <span class="compareOperator">></span> <span class="number">10</span>, <span class="string">"YES"</span>, <span class="number">42</span> <span class="arithmeticOperator">+</span> <span class="number">1e7</span>)`,
    );
  });
});
