import type { Completion, CompletionResult } from "@codemirror/autocomplete";
import { CompletionContext, autocompletion } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";

import {
  createTemplateAutocompleteSource,
  mustacheHelpersCompletionSource,
} from "./autocomplete";

// Mock context data for testing variable suggestions
const MOCK_CONTEXT = {
  user: {
    id: 1,
    name: "Test User",
    address: {
      street: "123 Main St",
      city: "Testville",
    },
  },
  card: {
    id: 10,
    name: "Test Card",
  },
  topLevelVar: "value",
};

const BLOCK_HELPERS = ["each", "if", "unless", "with", "lookup"].map(
  (name) => ({ name, doc: "", type: "built-in" as const }),
);
const METABASE_BLOCK_HELPERS = [
  "count",
  "format-date",
  "now",
  "card-url",
  "trash-url",
  "dashboard-url",
].map((name) => ({ name, doc: "", type: "custom" as const }));
const METABASE_INLINE_HELPERS = [
  "and",
  "empty",
  "else",
  "eq",
  "gt",
  "gte",
  "lt",
  "lte",
  "ne",
  "or",
  "not",
].map((name) => ({ name, doc: "", type: "custom" as const }));

// We'll use these for now, but we might need to split custom helpers
// to provide more sophisticated autocompletion.
const ALL_MB_HELPERS = [...METABASE_BLOCK_HELPERS, ...METABASE_INLINE_HELPERS];

const helpers = [...BLOCK_HELPERS, ...ALL_MB_HELPERS];
// Define the default sources
const defaultSources = [
  mustacheHelpersCompletionSource(helpers),
  createTemplateAutocompleteSource(MOCK_CONTEXT, helpers),
];

// Updated helper to get completions, handling single or multiple sources
async function getCompletionsHelper(
  doc: string,
): Promise<CompletionResult | null> {
  const pos = doc.length;

  // Setup EditorState and CompletionContext once
  const templateAutocompleteExtension = autocompletion({
    override: defaultSources,
  });
  const state = EditorState.create({
    doc,
    extensions: [templateAutocompleteExtension],
  });
  const context = new CompletionContext(state, pos, true);

  // Mock context methods
  // We might need to clear mocks if this runs multiple times in one test run
  jest.spyOn(context, "tokenBefore").mockReturnValue(null);
  jest.spyOn(context, "matchBefore").mockImplementation((expr) => {
    const textBefore = state.doc.sliceString(0, pos);
    const match = textBefore.match(expr);
    if (!match || match.index === undefined) {
      return null;
    }
    const from = match.index;
    const to = from + match[0].length;
    return { from, to, text: match[0] };
  });

  let combinedOptions: Completion[] = [];

  // 1. Determine the prefix and its start position (used for filtering and final 'from')
  const textBefore = doc.slice(0, pos);
  const prefixMatch = textBefore.match(/[\w\.]*$/);
  const prefix = prefixMatch ? prefixMatch[0] : "";
  const matchFrom = prefixMatch ? (prefixMatch.index ?? pos) : pos;

  let overallResultStructure: Omit<CompletionResult, "options"> | null = null;

  // 2. Collect Raw Options & Structure from specified sources
  for (const func of defaultSources) {
    // Call source function directly with the created context
    const result = await func(context);
    if (result) {
      // Capture the structure (like span, validFor) from the first source that provides it
      if (overallResultStructure === null) {
        const { options, ...structure } = result;
        overallResultStructure = structure;
      }
      combinedOptions = combinedOptions.concat(result.options);
    }
  }

  // If no source provided any result structure, we can't proceed
  if (overallResultStructure === null) {
    return null;
  }

  // 3. Filter combined options based on the determined prefix
  const filteredOptions = combinedOptions.filter((option) =>
    option.label.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  // 4. Handle No Matches after filtering
  // If there's a prefix but no options match, return null
  // If prefix is empty, allow empty results (e.g., for closing tags potentially, though handled later)
  if (filteredOptions.length === 0 && prefix.length > 0) {
    return null;
  }

  // 5. Sort the filtered options
  const mutableOptions = [...filteredOptions];
  mutableOptions.sort((a: Completion, b: Completion) => {
    const boostA = a.boost ?? 0;
    const boostB = b.boost ?? 0;
    if (boostB !== boostA) {
      return boostB - boostA;
    }
    if (a.label.length !== b.label.length) {
      return a.label.length - b.label.length;
    }
    return a.label.localeCompare(b.label);
  });

  // 6. Construct the final result
  const finalResult: CompletionResult = {
    ...overallResultStructure,
    // Use the 'from' calculated from the prefix match for the final result,
    // unless the original source provided a specific span, in which case respect that.
    from:
      typeof (overallResultStructure as any).from === "number"
        ? (overallResultStructure as any).from
        : matchFrom,
    options: mutableOptions,
  };

  // Handle specific case for closing tag suggestions where 'from' needs adjustment by the source
  // The mustacheHelpersCompletionSource should return the correct 'from' after {{/
  // Let's ensure the final 'from' respects that if it comes from the source structure.
  if (
    finalResult.options.length === 1 &&
    finalResult.options[0].label.startsWith("/") &&
    typeof overallResultStructure.from === "number"
  ) {
    // If source gave a 'from' (like mustacheHelpers for /if), use its 'from'
    finalResult.from = overallResultStructure.from;
  } else if (
    // Fallback for edge cases or if 'from' wasn't provided, but looks like a close tag
    finalResult.options.length === 1 &&
    finalResult.options[0].label.startsWith("/")
  ) {
    // This logic might be redundant if source always provides span, but acts as safety
    const closeTagMatch = textBefore.match(/\{\{\/\s*$/);
    if (closeTagMatch && closeTagMatch.index !== undefined) {
      finalResult.from = closeTagMatch.index + closeTagMatch[0].length;
    }
  }

  // If after all filtering and sorting, we have no options, return null
  if (finalResult.options.length === 0) {
    return null;
  }

  return finalResult;
}

describe("Mustache Autocomplete Sources", () => {
  describe("mustacheHelpersCompletionSource", () => {
    it("should suggest nothing outside mustaches", async () => {
      const result = await getCompletionsHelper("Hello world");
      expect(result).toBeNull();
    });

    it("should suggest block/metabase helpers and variables on {{ opening", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{ ");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      // Check for boosted helpers first (order might vary slightly based on sorting details)
      expect(labels).toContain("#each"); // Block helper
      expect(labels).toContain("count"); // Metabase helper
      // Check for variables
      expect(labels).toContain("user.name");
      expect(labels).toContain("card.id");
      expect(labels).toContain("topLevelVar");
    });

    it("should suggest ONLY block helpers on {{# opening", async () => {
      // Uses default sources (but createTemplateAutocompleteSource should return null here)
      const result = await getCompletionsHelper("{{#");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels?.sort()).toEqual(
        ["each", "if", "unless", "with", "lookup"].sort(),
      );
    });

    it("should filter block helpers on {{# prefix", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{#if");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels?.sort()).toEqual(["if"].sort());
    });

    it("should suggest closing tag for open block on {{/ opening", async () => {
      const doc = "{{#if user.name}} Hello {{/";
      // Test only the helper source for this specific logic
      const result = await getCompletionsHelper(doc);
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toEqual(["if"]);
    });

    it("should suggest correct closing tag for nested blocks", async () => {
      const doc = "{{#each users}}{{#if active}} User: {{name}} {{/";
      // Test only the helper source
      const result = await getCompletionsHelper(doc);
      expect(result).not.toBeNull();
      expect(result?.options.map((o) => o.label)).toEqual(["if"]);
      expect(result?.from).toBe(doc.length); // From after {{/

      const docOuter = doc + "if}} {{/";
      // Test only the helper source
      const resultOuter = await getCompletionsHelper(docOuter);
      expect(resultOuter).not.toBeNull();
      expect(resultOuter?.options.map((o) => o.label)).toEqual(["each"]);
      expect(resultOuter?.from).toBe(docOuter.length); // From after {{/
    });

    it("should NOT suggest closing tag if no block is open", async () => {
      const doc = "{{/";
      // Test only the helper source
      const result = await getCompletionsHelper(doc);
      expect(result).toBeNull();
    });

    it("should suggest closing tag proactively on {{ if block open", async () => {
      const doc = "{{#if condition}} Some text {{ ";
      // Uses default sources
      const result = await getCompletionsHelper(doc);
      expect(result).not.toBeNull();
      const firstSuggestion = result?.options[0];
      expect(firstSuggestion?.label).toBe("/if"); // Closing tag is boosted
      expect(firstSuggestion?.boost).toBeGreaterThan(1);
    });

    it("should NOT suggest block helpers after {{# space", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{# ");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).not.toContain("if");
    });

    it("should NOT suggest closing tag after {{/ space", async () => {
      const doc = "{{#if condition}} {{/ ";
      // Uses default sources, but specifically testing helper source behavior
      const result = await getCompletionsHelper(doc);
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).not.toContain("if");
    });
  });

  describe("createTemplateAutocompleteSource", () => {
    it("should suggest variables after {{ opening (if no helper prefix)", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{ us");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("user.id");
      expect(labels).toContain("user.name");
      expect(labels).toContain("user.address.street");
      expect(labels).not.toContain("card.id"); // Filtered by prefix 'us'
      expect(labels).not.toContain("#if"); // No helpers from this source
    });

    it("should suggest variables after helper and space", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{#if user.");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("user.id");
      expect(labels).toContain("user.name");
      expect(labels).toContain("user.address.city");
    });

    it("should NOT suggest variables when typing helper name {{#if", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{#if");
      // createTemplateAutocompleteSource should return null,
      // mustacheHelpersCompletionSource provides the 'if' completion.
      expect(result).not.toBeNull(); // Helpers are suggested
      const variableLabels = result?.options
        .filter((o) => o.type === "variable")
        .map((o) => o.label);
      expect(variableLabels).toEqual([]); // No variable suggestions
    });

    it("should suggest inline helpers immediately inside parentheses", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{ (e");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("eq");
      expect(labels).toContain("empty");
      expect(labels).toContain("else");
      expect(labels).not.toContain("user.name"); // No variables here
      expect(labels).not.toContain("count"); // No Metabase helpers
      expect(labels).not.toContain("#if"); // No block helpers
    });

    it("should suggest variables after inline helper and space inside parentheses", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{ (eq user.");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("user.id");
      expect(labels).toContain("user.name");
      expect(labels).not.toContain("eq"); // No helpers here
    });

    it("should suggest variable inside parentheses", async () => {
      // Uses default sources
      const result = await getCompletionsHelper("{{ (eq user.name user.");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("user.id");
      expect(labels).toContain("user.name");
      expect(labels).not.toContain("card.id");
      expect(labels).not.toContain("eq"); // No helpers here
    });

    it("should require whitespace after closing parenthesis to show suggestions", async () => {
      // No suggestions immediately after closing parenthesis
      let result = await getCompletionsHelper("{{ (eq user.name)");
      expect(result).toBeNull();
      // Suggestions appear after closing parenthesis and a space
      result = await getCompletionsHelper("{{ (eq user.name) ");
      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label);
      expect(labels).toContain("user.id");
      expect(labels).toContain("user.name");
    });

    it("should handle nested parentheses correctly", async () => {
      // Uses default sources
      // Inside inner parens, right after '(': suggest inline helpers
      let result = await getCompletionsHelper("{{ (eq user.name ( ");
      const parensLabels = result?.options.map((o) => o.label);
      expect(parensLabels).toContain("and"); // Suggest inline helpers
      expect(parensLabels).not.toContain("user.id");

      // Inside inner parens, after helper + space + prefix: suggest variables
      result = await getCompletionsHelper("{{ (eq user.name (gt user.");
      const innerParensLabels = result?.options.map((o) => o.label);
      expect(innerParensLabels).not.toContain("gt");
      expect(innerParensLabels).toContain("user.id"); // Suggest variables

      // Back in outer parens, after ')) ' + space: suggest variables
      result = await getCompletionsHelper("{{ (eq user.name (gt user.id)) ");
      expect(result).not.toBeNull();
      const outerParensLabels = result?.options.map((o) => o.label);
      expect(outerParensLabels).toContain("user.id"); // Suggest variables
      expect(outerParensLabels).toContain("user.address.city");
      expect(outerParensLabels).toContain("card.name");
      expect(outerParensLabels).not.toContain("eq"); // Suggest inline helpers again
      expect(outerParensLabels).not.toContain("#if"); // Suggest inline helpers again
    });

    it("should filter object path variables correctly inside parentheses", async () => {
      // Uses default sources
      const text = "{{ (eq user.name user.";
      const result = await getCompletionsHelper(text);

      expect(result).not.toBeNull();
      const labels = result?.options.map((o) => o.label).sort();
      const expectedLabels = [
        "user.address.city",
        "user.address.street",
        "user.id",
        "user.name",
      ].sort();
      expect(labels).toEqual(expectedLabels);

      const idOption = result?.options.find((o) => o.label === "user.id");
      expect(idOption?.apply).toBe("id"); // Check apply logic works

      // Ensure other root variables/helpers are NOT suggested
      expect(labels).not.toContain("card.id");
      expect(labels).not.toContain("topLevelVar");
      expect(labels).not.toContain("eq");
    });
  });
});
