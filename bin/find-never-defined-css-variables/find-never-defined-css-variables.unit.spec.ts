import {
  extractVariableDefinitionsFromFileContent,
  extractVariableUsagesFromFileContent,
} from "./find-never-defined-css-variables";

describe("extractVariableDefinitionsFromFileContent", () => {
  it("should extract standard CSS variable definitions", () => {
    const content = `
      .my-class {
        color: var(--should-not-be-extracted);
        --color-brand: #509ee3;
        --color-text: #000;
      }
    `;
    const result = extractVariableDefinitionsFromFileContent(content);
    expect(result).toEqual(new Set(["--color-brand", "--color-text"]));
  });

  it("should extract CSS-in-JS variable definitions", () => {
    const content = `
      const MyContainer1 = styled.div\`
        color: var(--should-not-be-extracted);
        --theme-primary: "blue",
      \`;

      const MyContainer2 = styled.div({
        --theme-secondary: "#fff",
      })
    `;
    const result = extractVariableDefinitionsFromFileContent(content);
    expect(result).toEqual(new Set(["--theme-primary", "--theme-secondary"]));
  });

  it("should handle mixed quotes in definitions", () => {
    const content = `
      const theme = {
        '--single-quote': 'value',
        "--double-quote": "value",
        \`--backtick\`: \`value\`,
      };
    `;
    const result = extractVariableDefinitionsFromFileContent(content);
    expect(result).toEqual(
      new Set(["--single-quote", "--double-quote", "--backtick"]),
    );
  });
});

describe("extractVariableUsagesFromFileContent", () => {
  it("should extract usage from css syntax", () => {
    const content = `
      .button {
        --should-not-be-extracted: blue;
        color: var(--color-brand);
        background: var(--color-background);
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--color-brand", "--color-background"]));
  });

  it("should extract usage from css-in-js syntax", () => {
    const content = `
      const MyDiv1 = styled.div\`
        --should-not-be-extracted: blue;
        color: var(--theme-color);
      \`;

      const MyDiv2 = styled.div({
        background: var(--theme-background);
      })
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--theme-color", "--theme-background"]));
  });
});
