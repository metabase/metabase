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

  it("should extract bare usage with inner whitespace", () => {
    const content = `
      .button {
        color: var( --color-brand );
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--color-brand"]));
  });

  it("should extract bare usage split across multiple lines", () => {
    const content = `
      .button {
        --mb-color-background-secondary: var(
          --mb-color-background-tertiary-inverse
        );
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--mb-color-background-tertiary-inverse"]));
  });

  it("should extract bare usage nested inside a multi-line color-mix", () => {
    const content = `
      .label {
        color: color-mix(
          in srgb,
          var(--mb-color-text-primary-inverse) 45%,
          transparent
        );
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--mb-color-text-primary-inverse"]));
  });

  it("should treat a non-mb usage with a fallback as safe and not extract it", () => {
    // These are intentional override hooks: deliberately undefined, with a
    // sensible default. The fallback makes them safe by construction.
    const content = `
      .schedule {
        font-weight: var(--schedule-font-weight, normal);
        flex: var(--native-query-editor-flex, none);
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set());
  });

  it("should still extract an mb-* usage even when it has a fallback", () => {
    // `--mb-*` are design-system primitives expected to always be defined; a
    // fallback would silently mask a typo or a backport that drops the variable.
    const content = `
      .preview {
        border-radius: var(--mb-radius-md, 8px);
        background: var(--mb-color-brand, red);
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--mb-radius-md", "--mb-color-brand"]));
  });

  it("should extract a bare var nested in a non-mb fallback but not the safe wrapper", () => {
    const content = `
      .button {
        color: var(--notification-warning-text-color, var(--mb-color-text-secondary));
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set(["--mb-color-text-secondary"]));
  });

  it("should extract an mb-* wrapper with a fallback and the bare var nested in it", () => {
    const content = `
      .button {
        color: var(--mb-color-text-secondary, var(--notification-warning-text-color));
      }
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(
      new Set(["--mb-color-text-secondary", "--notification-warning-text-color"]),
    );
  });

  it("should ignore dynamically constructed var() usages", () => {
    // We can't statically validate the interpolated name, so these are skipped.
    const content = `
      const color = (name) => \`var(--mb-color-\${name})\`;
      const radius = (size) => \`var(--mb-radius-\${size}, 8px)\`;
    `;
    const result = extractVariableUsagesFromFileContent(content);
    expect(result).toEqual(new Set());
  });
});
