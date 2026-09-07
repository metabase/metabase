// Specialized implementation of the two boundary rules used by Metabase.
// Shares the existing policy; see OXLINT.md for supported features and tests.
import path from "node:path";

import micromatch from "micromatch";

import {
  elements,
  enforcedRules,
  boundarySettings,
  boundaryOptions,
} from "./module-boundaries.mjs";

const rootPath = path.resolve(import.meta.dirname, "../..");
const ignorePatterns = boundarySettings["boundaries/ignore"];
const defaultPolicy = boundaryOptions.default;
const message = boundaryOptions.message;

const normalize = (value) => value.replaceAll("\\", "/");

/**
 * Compile the subset of boundary configuration that this repository uses.
 * Unsupported selectors throw rather than silently weakening enforcement.
 */
export function createBoundaryChecker({ elements, rules, rootPath }) {
  const regexes = new Map();
  const compile = (pattern) => {
    if (typeof pattern !== "string") {
      throw new Error("Boundary selectors must be strings");
    }
    if (!regexes.has(pattern)) {
      regexes.set(pattern, micromatch.makeRe(pattern));
    }
    return regexes.get(pattern);
  };
  const descriptors = elements.map((element) => {
    if (
      element.capture ||
      element.baseCapture ||
      element.basePattern ||
      ![undefined, "folder", "full"].includes(element.mode) ||
      typeof element.pattern !== "string"
    ) {
      throw new Error(`Unsupported boundary descriptor: ${element.type}`);
    }
    // The upstream matcher tests full-mode descriptors against the entire path
    // before folder-mode descriptors can match the accumulated path segments.
    return {
      ...element,
      regex: compile(
        element.mode === "full" ? element.pattern : `${element.pattern}/**/*`,
      ),
    };
  });
  const ordered = [
    ...descriptors.filter((element) => element.mode === "full"),
    ...descriptors.filter((element) => element.mode !== "full"),
  ];
  const ignores = ignorePatterns.map(compile);
  const classifications = new Map();

  function classify(filename) {
    const relativePath = normalize(path.relative(rootPath, filename));
    if (!classifications.has(relativePath)) {
      const isIgnored = ignores.some((regex) => regex.test(relativePath));
      const match = isIgnored
        ? undefined
        : ordered.find((element) => element.regex.test(relativePath));
      classifications.set(relativePath, {
        type: match?.type ?? null,
        isIgnored,
        isUnknown: !match && !isIgnored,
      });
    }
    return classifications.get(relativePath);
  }

  const policies = rules.map((rule) => {
    const supported = new Set(["from", "allow", "disallow", "message"]);
    if (Object.keys(rule).some((key) => !supported.has(key))) {
      throw new Error("Unsupported boundary policy selector");
    }
    if (!Array.isArray(rule.from)) {
      throw new Error("Boundary policies require a from array");
    }
    return {
      ...rule,
      from: rule.from.map(compile),
      allow: (rule.allow ?? []).map(compile),
      disallow: (rule.disallow ?? []).map(compile),
    };
  });
  const types = [...new Set(elements.map((element) => element.type))];
  const decisions = new Map();
  for (const from of types) {
    const destinations = new Map();
    decisions.set(from, destinations);
    const applicable = policies.filter((policy) =>
      policy.from.some((regex) => regex.test(from)),
    );
    for (const to of types) {
      let allowed = defaultPolicy === "allow";
      let finalMessage = message;
      for (const policy of applicable) {
        // A denial wins inside one policy; subsequent matching policies win.
        if (policy.disallow.some((regex) => regex.test(to))) {
          allowed = false;
          finalMessage = policy.message ?? message;
        } else if (policy.allow.some((regex) => regex.test(to))) {
          allowed = true;
          finalMessage = policy.message ?? message;
        }
      }
      destinations.set(to, {
        allowed,
        message: finalMessage
          .replaceAll("${file.type}", from)
          .replaceAll("${dependency.type}", to),
      });
      if (from === to && !allowed) {
        throw new Error(
          "Self-denial requires upstream element-identity semantics",
        );
      }
    }
  }

  function decision(from, to) {
    const result = decisions.get(from)?.get(to);
    if (!result) {
      throw new Error(`Unclassified boundary pair: ${from} -> ${to}`);
    }
    return result;
  }

  return { classify, decision, types };
}

// Each checker belongs to this loaded policy snapshot. File classifications only
// depend on the path and policy, never on file contents or resolver results.
const checker = createBoundaryChecker({
  elements,
  rules: enforcedRules,
  rootPath,
});
export function createBoundaryPlugin({ resolve }) {
  return {
    meta: { name: "boundaries", version: "0.0.0-experimental" },
    rules: {
      "no-unknown-files": {
        meta: { type: "problem", schema: [] },
        create(context) {
          if (!checker.classify(context.filename).isUnknown) {
            return {};
          }
          return {
            Program(node) {
              context.report({
                node,
                message: "File is not of any known element type",
              });
            },
          };
        },
      },
      "element-types": {
        meta: { type: "problem", schema: [{ type: "object" }] },
        create(context) {
          const from = checker.classify(context.filename);
          if (!from.type || from.isIgnored) {
            return {};
          }
          function check(node) {
            if (typeof node.value !== "string") {
              return;
            }
            const resolved = resolve(node.value, context);
            if (!resolved || normalize(resolved).includes("/node_modules/")) {
              return;
            }
            const to = checker.classify(resolved);
            if (!to.type || to.isIgnored) {
              return;
            }
            const result = checker.decision(from.type, to.type);
            if (!result.allowed) {
              context.report({ node, message: result.message });
            }
          }
          // Match the current dependency-nodes configuration, including type-only
          // imports and dynamic imports, but excluding requires and re-exports.
          return {
            ImportDeclaration(node) {
              check(node.source);
            },
            ImportExpression(node) {
              check(node.source);
              if (node.options) {
                check(node.options);
              }
            },
          };
        },
      },
    },
  };
}
