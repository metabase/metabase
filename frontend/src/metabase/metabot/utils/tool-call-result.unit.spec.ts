import { parseToolCallResult } from "./tool-call-result";

describe("parseToolCallResult", () => {
  it("returns nothing for a missing result", () => {
    expect(parseToolCallResult(undefined)).toEqual({});
    expect(parseToolCallResult(null)).toEqual({});
    expect(parseToolCallResult("")).toEqual({});
  });

  it("keeps a result that is not a JSON object as text", () => {
    expect(parseToolCallResult("Table: Orders\nRows: 100")).toEqual({
      output: "Table: Orders\nRows: 100",
    });
    expect(parseToolCallResult("42")).toEqual({ output: "42" });
    expect(parseToolCallResult("[1,2]")).toEqual({ output: "[1,2]" });
  });

  it("keeps a result map's text output unescaped", () => {
    const result = parseToolCallResult(
      JSON.stringify({ output: "<result>\nid: 1\n</result>" }),
    );

    expect(result).toEqual({ output: "<result>\nid: 1\n</result>" });
  });

  it("splits structured output from the output", () => {
    const result = parseToolCallResult(
      JSON.stringify({
        output: "Query created",
        structured_output: { "query-id": "q1" },
      }),
    );

    expect(result).toEqual({
      output: "Query created",
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
      output: "Query created",
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
      output: "Read 1 resource",
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

    expect(result).toEqual({ structuredOutput: '{\n  "success": true\n}' });
  });

  it("pretty prints an object without an output key as the whole output", () => {
    const result = parseToolCallResult(JSON.stringify({ cards: [1, 2] }));

    expect(result).toEqual({
      output: '{\n  "cards": [\n    1,\n    2\n  ]\n}',
    });
  });

  it("drops an empty output", () => {
    expect(parseToolCallResult(JSON.stringify({ output: "" }))).toEqual({});
    expect(parseToolCallResult(JSON.stringify({ output: null }))).toEqual({});
  });
});
