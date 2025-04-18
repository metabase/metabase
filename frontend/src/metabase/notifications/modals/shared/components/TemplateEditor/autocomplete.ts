import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";

import type { Settings } from "metabase-types/api";

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

// --- Utility functions for shared logic ---
function isInsideOpenMustache(textBefore: string): boolean {
  const lastOpen = textBefore.lastIndexOf("{{");
  const lastClose = textBefore.lastIndexOf("}}");
  return lastOpen > lastClose;
}

function getParenLevel(text: string): number {
  let level = 0;
  for (const char of text) {
    if (char === "(") {
      level++;
    } else if (char === ")") {
      level--;
    }
  }
  return level;
}

function extractPrefix(
  textBefore: string,
  pos: number,
): { prefix: string; start: number } | null {
  const match = textBefore.match(/[\w\.]*$/);
  if (!match) {
    return null;
  }
  return { prefix: match[0], start: match.index ?? pos };
}

function createCompletionOptions(
  labels: string[],
  type: "keyword" | "variable" | "function",
  boost = 1,
): MustacheCompletionOption[] {
  return labels.map((label) => ({ label, type, boost }));
}

// Suggest block helpers, Metabase helpers, and closing tags based on context
export const mustacheHelpersCompletionSource =
  (helpers: Settings["default-handlebars-helpers"] = []) =>
  (completionContext: CompletionContext): CompletionResult | null => {
    const builtinBlockHelpers = helpers
      .filter((helper) => helper.type === "built-in")
      .map((helper) => helper.name);
    const mbBlockHelpers = helpers
      .filter((helper) => helper.type === "custom-block")
      .map((helper) => helper.name);

    const textBefore = completionContext.state.doc.sliceString(
      0,
      completionContext.pos,
    );
    if (!isInsideOpenMustache(textBefore)) {
      return null;
    }

    // Context 1: Typing opening helper or variable (NOT inside parentheses)
    const blockContent = textBefore.substring(textBefore.lastIndexOf("{{"));
    const parenLevel = getParenLevel(blockContent);

    // Context 2: Typing a closing helper {{/
    const closeMatch = completionContext.matchBefore(/{{\/\w*$/); // Allow space after /
    if (closeMatch) {
      const currentlyOpenHelper = getOpenBlockHelper(textBefore);
      if (!currentlyOpenHelper) {
        return null;
      }
      const prefixMatch = closeMatch.text.match(/\w*$/);
      const options = createCompletionOptions(
        builtinBlockHelpers.filter(
          (helperName) =>
            helperName === currentlyOpenHelper &&
            helperName.startsWith(prefixMatch ? prefixMatch[0] : ""),
        ),
        "keyword",
      );
      if (options.length === 0) {
        return null;
      }
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
          options = createCompletionOptions(
            builtinBlockHelpers.filter((helper) =>
              helper.startsWith(typedAfterHash),
            ),
            "keyword",
            99,
          );
        } else {
          const blockOptions = createCompletionOptions(
            builtinBlockHelpers.map((helperName) => `#${helperName}`),
            "keyword",
            1,
          );
          const metabaseOptions = createCompletionOptions(
            mbBlockHelpers,
            "function",
            1,
          );
          options = blockOptions.concat(metabaseOptions);
        }
        // Add proactive closing tag suggestion
        const currentlyOpenHelper = getOpenBlockHelper(textBefore);
        if (currentlyOpenHelper) {
          const closingTag = `/${currentlyOpenHelper}`;
          const closingOption: MustacheCompletionOption = {
            label: closingTag,
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
    return null; // No context matched
  };

// Build suggestions for template variables AND helpers inside parentheses
export const createTemplateAutocompleteSource = (
  context: Record<string, any>,
  helpers: Settings["default-handlebars-helpers"],
): CompletionSource => {
  const mbInlineHelpers = helpers
    .filter((helper) => helper.type === "custom-inline")
    .map((helper) => helper.name);
  // Precompute all possible paths once
  const allVarPaths = getAllPaths(context);
  const baseVarOptions = createCompletionOptions(allVarPaths, "variable", -1);
  const inlineHelperOptions = createCompletionOptions(
    mbInlineHelpers,
    "keyword",
    1,
  );

  return (completionContext: CompletionContext): CompletionResult | null => {
    const { state, pos } = completionContext;
    const textBefore = state.doc.sliceString(0, pos);
    if (!isInsideOpenMustache(textBefore)) {
      return null;
    }

    const prefixObj = extractPrefix(textBefore, pos);
    if (!prefixObj) {
      return null;
    }
    const { prefix, start: prefixStartPos } = prefixObj;

    // Check if likely inside parentheses
    const contentSinceMustache = textBefore.substring(
      textBefore.lastIndexOf("{{"),
    );
    const parensCheckText = contentSinceMustache.slice(
      0,
      prefixStartPos - textBefore.lastIndexOf("{{"),
    );
    const parenLevel = getParenLevel(parensCheckText);
    const isInsideParens = parenLevel > 0;

    let optionsToSuggest: MustacheCompletionOption[] = [];
    let resultFrom = prefixStartPos;

    if (isInsideParens) {
      if (prefix.includes(".")) {
        const lastDotIndex = prefix.lastIndexOf(".");
        const basePath = prefix.substring(0, lastDotIndex + 1);
        optionsToSuggest = baseVarOptions
          .filter(
            (opt) => opt.label.startsWith(prefix) && opt.label !== basePath,
          )
          .map((opt) => {
            const applyPart = opt.label.substring(basePath.length);
            return applyPart ? { ...opt, apply: applyPart } : null;
          })
          .filter((opt) => opt !== null) as MustacheCompletionOption[];
        resultFrom = pos - (prefix.length - lastDotIndex - 1);
      } else {
        const textRightBeforePrefix = textBefore.substring(0, prefixStartPos);
        const trimmedTextBefore = textRightBeforePrefix.trimEnd();
        const effectiveCharBefore = trimmedTextBefore.charAt(
          trimmedTextBefore.length - 1,
        );
        if (effectiveCharBefore === "(") {
          optionsToSuggest = inlineHelperOptions;
          resultFrom = prefix === "" ? pos : prefixStartPos;
        } else {
          optionsToSuggest = baseVarOptions;
          resultFrom = prefixStartPos;
        }
      }
    } else {
      const contentBetweenBraces = textBefore.substring(
        textBefore.lastIndexOf("{{") + 2,
      );
      const trimmedContent = contentBetweenBraces.trimStart();
      if (/^#\w*$/.test(trimmedContent)) {
        return null;
      }
      if (trimmedContent === "/") {
        return null;
      }
      const charBefore = textBefore[prefixStartPos - 1];
      if (charBefore === ")") {
        const charAfter = state.doc.sliceString(
          prefixStartPos,
          prefixStartPos + 1,
        );
        if (charAfter.length === 0) {
          return null;
        }
        if (!/\s/.test(charAfter)) {
          return null;
        }
      }
      optionsToSuggest = baseVarOptions;
      resultFrom = prefixStartPos;
    }

    const finalOptions = optionsToSuggest.filter((opt) => opt.label !== prefix);
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
