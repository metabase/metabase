import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

// Type helper for consistent completion options
export type MustacheCompletionOption = Completion & {
  type: "keyword" | "variable" | "function";
};

// Helper function to recursively find all leaf paths in an object
function getAllPaths(obj: any, currentPath = ""): string[] {
  let paths: string[] = [];
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return [];
  }

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newPath = currentPath ? `${currentPath}.${key}` : key;
      const value = obj[key];

      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        value.constructor === Object
      ) {
        paths = paths.concat(getAllPaths(value, newPath));
      } else {
        paths.push(newPath);
      }
    }
  }
  return paths;
}

// Define helper categories clearly
const BLOCK_HELPERS = ["each", "if", "unless", "with"];
const METABASE_HELPERS = [
  "count",
  "format-date",
  "now",
  "card-url",
  "trash-url",
  "dashboard-url",
];
const INLINE_CONDITIONAL_HELPERS = [
  "and",
  "empty",
  "else",
  "eq",
  "gt",
  "gte",
  "lookup",
  "lt",
  "lte",
  "ne",
  "or",
  "not",
];

// Helper to compute the currently open block helper (for closing tag suggestions)
function getOpenBlockHelper(text: string): string | undefined {
  const openBlockPattern = /{{\s*#(\w+)\b.*?}}/gs;
  const closeBlockPattern = /{{\s*\/(\w+)\b.*?}}/gs;
  const openMatches = Array.from(text.matchAll(openBlockPattern));
  const closeMatches = Array.from(text.matchAll(closeBlockPattern));
  const blockStack: string[] = [];
  const closedCounts: Record<string, number> = {};
  const openCounts: Record<string, number> = {};

  for (const match of closeMatches) {
    const helper = match[1];
    closedCounts[helper] = (closedCounts[helper] || 0) + 1;
  }
  for (const match of openMatches) {
    const helper = match[1];
    openCounts[helper] = (openCounts[helper] || 0) + 1;
    if (openCounts[helper] > (closedCounts[helper] || 0)) {
      blockStack.push(helper);
    }
  }
  return blockStack.pop();
}

// Suggest block helpers, Metabase helpers, and closing tags based on context
export const mustacheHelpersCompletionSource: CompletionSource = (
  completionContext: CompletionContext,
): CompletionResult | null => {
  const textBefore = completionContext.state.doc.sliceString(
    0,
    completionContext.pos,
  );
  const lastOpenMustache = textBefore.lastIndexOf("{{");
  const lastCloseMustache = textBefore.lastIndexOf("}}");

  // Only provide suggestions if inside an unclosed {{ }} block
  if (lastOpenMustache > lastCloseMustache) {
    // Context 1: Typing opening helper or variable (NOT inside parentheses)
    const blockContent = textBefore.substring(lastOpenMustache);
    let parenLevel = 0;
    for (const char of blockContent) {
      if (char === "(") {
        parenLevel++;
      } else if (char === ")") {
        parenLevel--;
      }
    }

    // Context 2: Typing a closing helper {{/
    const closeMatch = completionContext.matchBefore(/{{\/\w*$/); // Allow space after /
    if (closeMatch) {
      const currentlyOpenHelper = getOpenBlockHelper(textBefore);
      if (!currentlyOpenHelper) return null;
      const prefixMatch = closeMatch.text.match(/\w*$/);
      const options: MustacheCompletionOption[] = BLOCK_HELPERS.filter(
        (helperName) =>
          helperName === currentlyOpenHelper &&
          helperName.startsWith(prefixMatch ? prefixMatch[0] : ""),
      ).map((helperName) => ({ label: helperName, type: "keyword" }));
      if (options.length === 0) return null;
      return {
        from: prefixMatch
          ? closeMatch.from + (prefixMatch.index ?? 0)
          : completionContext.pos,
        options,
        filter: true,
      };
    }

    // Only proceed if we are NOT inside parentheses (parenLevel <= 0)
    if (parenLevel <= 0) {
      const openMatch = completionContext.matchBefore(/(?<!\(){{\s*[#]?\w*$/);
      if (openMatch) {
        const startsWithHash = openMatch.text.includes("#");
        let options: MustacheCompletionOption[];
        if (startsWithHash) {
          const typedAfterHash = openMatch.text.match(/\s*#(\w*)$/)?.[1] || "";
          options = BLOCK_HELPERS.filter((helper) =>
            helper.startsWith(typedAfterHash),
          ).map((helperName) => ({
            label: helperName,
            type: "keyword",
            boost: 99,
          }));
        } else {
          const blockOptions: MustacheCompletionOption[] = BLOCK_HELPERS.map(
            (helperName) => ({
              label: `#${helperName}`,
              type: "keyword",
              boost: 1,
            }),
          );
          const metabaseOptions: MustacheCompletionOption[] =
            METABASE_HELPERS.map((label) => ({
              label,
              type: "function",
              boost: 1,
            }));
          options = blockOptions.concat(metabaseOptions);
        }
        // Add proactive closing tag suggestion
        const currentlyOpenHelper = getOpenBlockHelper(textBefore);
        if (currentlyOpenHelper) {
          const closingTag = `/${currentlyOpenHelper}`;
          const closingLabel = `/${currentlyOpenHelper}`;
          const closingOption: MustacheCompletionOption = {
            label: closingLabel,
            type: "keyword",
            apply: closingTag,
            boost: 5,
            info: `Close the open #${currentlyOpenHelper} block`,
          };
          options.unshift(closingOption);
        }
        if (startsWithHash) {
          const hashIndex = openMatch.text.indexOf("#");
          let afterHash = hashIndex + 1;
          while (openMatch.text[afterHash] === " ") {
            afterHash++;
          }
          return {
            from: openMatch.from + afterHash,
            options: options,
            filter: false,
          };
        } else {
          // Otherwise, use the old logic (after {{ and whitespace)
          const afterBraces = openMatch.text.match(/{{\s*/)?.[0].length || 2;
          return {
            from: openMatch.from + afterBraces,
            options: options,
            filter: false,
          };
        }
      }
    }
  }
  return null; // No context matched
};

// Build suggestions for template variables AND helpers inside parentheses
export const createTemplateAutocompleteSource = (
  context: Record<string, any>,
): CompletionSource => {
  // Precompute all possible paths once
  const allVarPaths = getAllPaths(context);
  // Generate base options with full paths as labels
  const baseVarOptions: MustacheCompletionOption[] = allVarPaths.map(
    (path) => ({
      label: path,
      type: "variable",
      boost: -1, // Lower boost than helpers
    }),
  );

  const inlineHelperOptions: MustacheCompletionOption[] =
    INLINE_CONDITIONAL_HELPERS.map((label) => ({
      label,
      type: "keyword",
      boost: 1, // Higher boost than variables
    }));

  return (completionContext: CompletionContext): CompletionResult | null => {
    const { state, pos } = completionContext;
    const textBefore = state.doc.sliceString(0, pos);

    // Ensure we are inside an active {{ block
    const lastOpenMustache = textBefore.lastIndexOf("{{");
    const lastCloseMustache = textBefore.lastIndexOf("}}");
    if (lastOpenMustache <= lastCloseMustache) {
      return null; // Not inside an active {{ block
    }

    // Get prefix and its start position
    const prefixMatch = textBefore.match(/[\w\.]*$/);
    // We need prefixMatch to proceed
    if (prefixMatch === null) {
      return null;
    }
    const prefixStartPos = prefixMatch.index ?? pos;

    // Check if likely inside parentheses
    // A simple check: is there an unclosed '(' between the last {{ and the prefix start?
    const contentSinceMustache = textBefore.substring(lastOpenMustache);
    const parensCheckText = contentSinceMustache.slice(
      0,
      prefixStartPos - lastOpenMustache,
    );
    let parenLevel = 0;
    for (const char of parensCheckText) {
      if (char === "(") {
        parenLevel++;
      } else if (char === ")") {
        parenLevel--;
      }
    }
    const isInsideParens = parenLevel > 0;

    let optionsToSuggest: MustacheCompletionOption[] = [];
    let resultFrom = prefixStartPos;

    if (isInsideParens) {
      const input = prefixMatch[0];
      // *** Inside Parentheses Logic ***
      if (input.includes(".")) {
        // Object path completion (e.g., user.)
        const lastDotIndex = input.lastIndexOf(".");
        const basePath = input.substring(0, lastDotIndex + 1);
        // The filter should be applied only to the part after the last dot
        optionsToSuggest = baseVarOptions
          .filter(
            (opt) => opt.label.startsWith(input) && opt.label !== basePath,
          )
          .map((opt) => {
            const applyPart = opt.label.substring(basePath.length);
            // Only suggest if there's something to apply after the dot
            return applyPart ? { ...opt, apply: applyPart } : null;
          })
          .filter((opt) => opt !== null) as MustacheCompletionOption[];
        // Set 'from' so that filtering is only on the segment after the last dot
        resultFrom = pos - (prefixMatch[0].length - lastDotIndex - 1);
      } else {
        // Not an object path (e.g., (, eq, user)
        // Check the last non-whitespace character before the prefix start was '('
        const textRightBeforePrefix = textBefore.substring(0, prefixStartPos);
        const trimmedTextBefore = textRightBeforePrefix.trimEnd(); // Remove trailing whitespace
        const effectiveCharBefore = trimmedTextBefore.charAt(
          trimmedTextBefore.length - 1,
        ); // Get last non-whitespace char

        // If the last significant character before the prefix was '(', suggest helpers
        if (effectiveCharBefore === "(") {
          // Suggest only inline helpers right after '(' or '( '
          optionsToSuggest = inlineHelperOptions;
          // Adjust 'from' position based on whether the prefix itself is empty or not
          resultFrom = prefixMatch[0] === "" ? pos : prefixStartPos;
        } else {
          // Suggest only variables otherwise (after helper/variable name inside parens)
          // (or if typing the first helper/variable name)
          optionsToSuggest = baseVarOptions;
          resultFrom = prefixStartPos; // From start of variable/helper prefix
        }
      }
    } else {
      // *** Outside Parentheses Logic (but inside {{ }}) ***
      const contentBetweenBraces = textBefore.substring(lastOpenMustache + 2);
      const trimmedContent = contentBetweenBraces.trimStart();
      // If the user is typing a block helper (e.g., '{{ #ea'), do NOT suggest variables
      // But if they've typed a space after the helper (e.g., '{{ #each '), allow variables
      if (/^#\w*$/.test(trimmedContent)) {
        return null;
      }
      // Return null ONLY if the user has typed exactly '/' after {{ (allowing for whitespace)
      if (trimmedContent === "/") {
        return null;
      }
      // --- Require whitespace after closing parenthesis to show suggestions ---
      // If the character immediately before the cursor is a ')', require whitespace (or end of input) after it
      const charBefore = textBefore[prefixStartPos - 1];
      if (charBefore === ")") {
        const charAfter = state.doc.sliceString(
          prefixStartPos,
          prefixStartPos + 1,
        );
        // Block suggestions if at end of input with ')' as last char
        if (charAfter.length === 0) {
          return null;
        }
        // Block suggestions if next char is not whitespace
        if (!/\s/.test(charAfter)) {
          return null;
        }
      }
      // Otherwise, suggest variables outside parentheses
      optionsToSuggest = baseVarOptions;
      resultFrom = prefixStartPos; // From start of variable prefix
    }

    // Filter out the exact prefix if it matches a label exactly
    // Needed because filter:true only checks startsWith
    const finalOptions = optionsToSuggest.filter(
      (opt) => opt.label !== prefixMatch[0],
    );

    if (finalOptions.length === 0) {
      return null;
    }

    return {
      from: resultFrom,
      options: finalOptions,
      filter: true,
    };
  };
};
