import { parseToolCallResult } from "./tool-call-result";

describe("parseToolCallResult", () => {
  it("returns nothing for a missing result", () => {
    expect(parseToolCallResult(undefined)).toEqual({});
    expect(parseToolCallResult(null)).toEqual({});
    expect(parseToolCallResult("")).toEqual({});
  });

  it("treats a non-JSON result as plain text output", () => {
    expect(parseToolCallResult("Table: Orders\nRows: 100")).toEqual({
      output: { value: "Table: Orders\nRows: 100", isJson: false },
    });
  });

  it("treats a JSON scalar as plain text output", () => {
    expect(parseToolCallResult("42")).toEqual({
      output: { value: "42", isJson: false },
    });
  });

  it("pretty prints a result map's output when it is itself JSON", () => {
    const result = parseToolCallResult(
      JSON.stringify({ output: '{"rows":[1,2]}' }),
    );

    expect(result).toEqual({
      output: { value: '{\n  "rows": [\n    1,\n    2\n  ]\n}', isJson: true },
    });
  });

  it("keeps a result map's text output unescaped", () => {
    const result = parseToolCallResult(
      JSON.stringify({ output: "<result>\nid: 1\n</result>" }),
    );

    expect(result).toEqual({
      output: { value: "<result>\nid: 1\n</result>", isJson: false },
    });
  });

  it("splits structured output from the output", () => {
    const result = parseToolCallResult(
      JSON.stringify({
        output: "Query created",
        structured_output: { "query-id": "q1" },
      }),
    );

    expect(result).toEqual({
      output: { value: "Query created", isJson: false },
      structuredOutput: '{\n  "query-id": "q1"\n}',
    });
  });

  it("reads the kebab-case structured output spelling of migrated rows", () => {
    const result = parseToolCallResult(
      JSON.stringify({
        output: "Query created",
        "structured-output": { "query-id": "q1" },
      }),
    );

    expect(result).toEqual({
      output: { value: "Query created", isJson: false },
      structuredOutput: '{\n  "query-id": "q1"\n}',
    });
  });

  it("collects the remaining keys of an untrimmed result map", () => {
    const result = parseToolCallResult(
      JSON.stringify({
        output: "Read 1 resource",
        structured_output: { "query-id": "q1" },
        resources: [{ uri: "metabase://card/1" }],
        "status-code": 404,
      }),
    );

    expect(result).toEqual({
      output: { value: "Read 1 resource", isJson: false },
      structuredOutput: '{\n  "query-id": "q1"\n}',
      extra: JSON.stringify(
        { resources: [{ uri: "metabase://card/1" }], "status-code": 404 },
        null,
        2,
      ),
    });
  });

  it("shows a result map with structured output but no output", () => {
    const result = parseToolCallResult(
      JSON.stringify({ structured_output: { success: true } }),
    );

    expect(result).toEqual({
      structuredOutput: '{\n  "success": true\n}',
    });
  });

  it("treats an object without an output key as the whole output", () => {
    const result = parseToolCallResult(JSON.stringify({ cards: [1, 2] }));

    expect(result).toEqual({
      output: {
        value: '{\n  "cards": [\n    1,\n    2\n  ]\n}',
        isJson: true,
      },
    });
  });

  it("treats an array result as the whole output", () => {
    expect(parseToolCallResult("[1,2]")).toEqual({
      output: { value: "[\n  1,\n  2\n]", isJson: true },
    });
  });

  it("drops an empty output", () => {
    expect(parseToolCallResult(JSON.stringify({ output: "" }))).toEqual({});
    expect(parseToolCallResult(JSON.stringify({ output: null }))).toEqual({});
  });
});
