/**
 * @fileoverview Files declared side-effect free (frontend/build/shared/rspack/side-effect-free-modules.js)
 * are dropped from production bundles once their exports go unused, so anything they do at import time is silently lost.
 * This reports module-scope code that does work at import.
 * A dropped file also takes with it everything only it imports, so it also reports an import
 * of a file that frontend/lint/side-effect-files.json classifies as having a global effect,
 * or of a third-party package the registry lists as doing global work at import.
 * The config decides which files are linted, not the rule.
 */

const fs = require("fs");
const path = require("path");

const {
  DEFAULT_REGISTRY_PATH,
  classify,
  classifyPackage,
  isFacade,
  loadRegistry,
} = require("../../side-effect-registry");

const REPO_ROOT = path.resolve(__dirname, "../../../..");

// The tsconfig `*` path roots: `metabase/x` is looked up under each in turn.
const DEFAULT_SOURCE_ROOTS = ["frontend/src", "enterprise/frontend/src"];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// Registry path -> parsed registry, so the file is read once per lint run rather than once per file.
const registries = new Map();

// Callees known to be pure, so a module-scope call to them needs no annotation.
// A name matches the imported binding or a property called on one (`memo`, `Button.extend`).
// Mantine's `extend` is the identity config helper every *.config.ts calls.
const DEFAULT_PURE_CALLEES = [
  {
    module: "react",
    names: ["createContext", "forwardRef", "memo", "lazy", "createElement"],
  },
  {
    module: "@mantine/core",
    names: [
      "rem",
      "getSize",
      "getDefaultZIndex",
      "factory",
      "polymorphicFactory",
      "createVarsResolver",
      "createPolymorphicComponent",
      "extend",
    ],
  },
  { module: "@mantine/dates", names: ["extend"] },
  { module: "@emotion/styled", names: "*" },
  { module: "classnames", names: "*" },
  { module: "clsx", names: "*" },
  { module: "ttag", names: ["t", "c", "jt", "ngettext", "msgid"] },
  { module: "color", names: "*" },
  { module: "@lezer/highlight", names: "*" },
  { module: "@codemirror/language", names: "*" },
  {
    module: "@reduxjs/toolkit",
    names: [
      "createSelector",
      "createReducer",
      "createAction",
      "createSlice",
      "createAsyncThunk",
      "createEntityAdapter",
    ],
  },
  { module: "reselect", names: ["createSelector", "createStructuredSelector"] },
  {
    module: "redux-actions",
    names: [
      "createAction",
      "createActions",
      "handleAction",
      "handleActions",
      "combineActions",
    ],
  },
  { module: "react-redux", names: ["connect"] },
  { module: "underscore", names: ["compose", "memoize", "once"] },
];

// These act on their first argument, so the verdict follows it: fine on a same-file object, a mutation otherwise.
const FIRST_ARGUMENT_MUTATORS = new Set([
  "Object.assign",
  "Object.defineProperty",
  "Object.defineProperties",
  "Object.freeze",
  "Object.seal",
]);

const CONTROL_FLOW_STATEMENTS = new Set([
  "IfStatement",
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
  "TryStatement",
  "SwitchStatement",
  "ThrowStatement",
  "LabeledStatement",
  "BlockStatement",
  "DebuggerStatement",
]);

// An expression under one of these is not judged.
// Function bodies run later, class bodies are not inspected,
// and a control-flow statement is reported once as a whole.
const NOT_MODULE_SCOPE = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "MethodDefinition",
  "PropertyDefinition",
  "AccessorProperty",
  "StaticBlock",
  ...CONTROL_FLOW_STATEMENTS,
]);

const EXPRESSION_WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
  "ChainExpression",
]);

const PURE_ANNOTATION = /^\s*[#@]__PURE__\s*$/;

const CALLEE_DISPLAY_LIMIT = 60;

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow import-time side effects in files declared side-effect free for rspack",
      category: "Best Practices",
      recommended: true,
    },
    schema: [
      {
        type: "object",
        properties: {
          pureCallees: {
            type: "array",
            items: {
              type: "object",
              properties: {
                module: { type: "string" },
                names: {
                  anyOf: [
                    { type: "array", items: { type: "string" } },
                    { const: "*" },
                  ],
                },
              },
              required: ["module", "names"],
              additionalProperties: false,
            },
          },
          sideEffectPaths: {
            type: "array",
            // Absolute paths allowed to have import-time effects: a file, or a
            // directory (trailing separator) covering every file under it
            items: { type: "string" },
          },
          internalModules: {
            type: "array",
            // Import alias roots that resolve inside this repo, e.g. "metabase"
            items: { type: "string" },
          },
          sideEffectRegistry: {
            // Path to the registry of effect files, default frontend/lint/side-effect-files.json
            type: "string",
          },
          sourceRoots: {
            type: "array",
            // Repo-relative directories a non-relative import is resolved under, default the tsconfig `*` roots
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bareImport:
        "Bare import of '{{source}}' runs it for its effect at import time. Move the effect into a registration module listed in SIDE_EFFECT_PATHS, or into an entry.",
      callOnImport:
        "Module-scope call on the imported binding `{{callee}}` runs at import time. If it is pure, annotate it `/* #__PURE__ */` or add it to pureCallees; otherwise move it out of module scope.",
      callAtModuleScope:
        "Module-scope call `{{callee}}` runs at import time and its result is unused, so it exists only for its effect. Move it into a registration module listed in SIDE_EFFECT_PATHS, or annotate it `/* #__PURE__ */` if it is pure.",
      assignToImport:
        "Assigning to `{{target}}` mutates an imported object at import time. Move it into a registration module listed in SIDE_EFFECT_PATHS.",
      assignToGlobal:
        "Assigning to `{{target}}` writes global state at import time. Move it into a registration module listed in SIDE_EFFECT_PATHS, or into an entry.",
      topLevelAwait:
        "Top-level await runs at import time. Move it into a function that is called from an entry.",
      controlFlow:
        "`{{kind}}` at module scope means work runs at import time. Move it into a function, or into a registration module listed in SIDE_EFFECT_PATHS.",
      importsGlobalEffect:
        "'{{source}}' runs an effect at import that code outside it depends on. A side-effect-free file must not be the reason it loads; import it from an entry (or list it in SIDE_EFFECT_PATHS if this file is a registration module).",
      importsGlobalEffectPackage:
        "'{{source}}' does work at import that code outside it depends on (a polyfill, a plugin on a host, global CSS). A side-effect-free file must not be the reason it loads; import it from an entry, or through the vendor's facade.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();
    const filename = context.filename || context.getFilename();
    const options = context.options[0] || {};
    const pureCallees = [
      ...DEFAULT_PURE_CALLEES,
      ...(options.pureCallees || []),
    ];
    const sideEffectPaths = normalizeSideEffectPaths(
      options.sideEffectPaths || [],
    );
    const internalModules = new Set(options.internalModules || []);
    const registry = getRegistry(
      options.sideEffectRegistry || DEFAULT_REGISTRY_PATH,
    );
    const sourceRoots = (options.sourceRoots || DEFAULT_SOURCE_ROOTS).map(
      (root) => path.resolve(REPO_ROOT, root),
    );

    function isInternalModule(source) {
      return (
        source.startsWith(".") || internalModules.has(packageNameOf(source))
      );
    }

    // Collected over the whole file before any expression is judged, so a function declared below its call site still counts as local.
    const localNames = new Set();
    // local name -> { module, importedName }
    const importBindings = new Map();

    function classifyRoot(root) {
      if (root == null || root.type !== "Identifier") {
        return "local";
      }
      if (importBindings.has(root.name)) {
        return "import";
      }
      if (localNames.has(root.name)) {
        return "local";
      }
      return "global";
    }

    // The annotation may sit on the call or on a wrapper around it (`/* #__PURE__ */ foo()!`).
    function isPureAnnotated(node) {
      for (const current of wrapperChain(node)) {
        const comments = sourceCode.getCommentsBefore(current);
        if (
          comments.length > 0 &&
          PURE_ANNOTATION.test(comments[comments.length - 1].value)
        ) {
          return true;
        }
      }
      return false;
    }

    function isAllowlistedCallee(callee) {
      const { root, name } = getCalleeInfo(callee);
      const binding = root == null ? null : importBindings.get(root.name);
      if (binding == null) {
        return false;
      }
      return pureCallees.some(
        (entry) =>
          entry.module === binding.module &&
          (entry.names === "*" ||
            entry.names.includes(name) ||
            (name === root.name && entry.names.includes(binding.importedName))),
      );
    }

    function display(node) {
      const text = sourceCode.getText(node).replace(/\s+/g, " ");
      return text.length > CALLEE_DISPLAY_LIMIT
        ? `${text.slice(0, CALLEE_DISPLAY_LIMIT)}…`
        : text;
    }

    function reportMutationOf(target, node, targetNode) {
      const kind = classifyRoot(getRoot(target));
      if (kind === "local") {
        return;
      }
      context.report({
        node,
        messageId: kind === "import" ? "assignToImport" : "assignToGlobal",
        data: { target: display(targetNode || target) },
      });
    }

    // A call in a statement exists only for its effect, so every call not known pure is reported.
    // In an initializer the value is kept, so only calls into packages are reported.
    // Our own code (relative or in-repo alias imports) and `new` are trusted there.
    function checkCall(node, inStatement) {
      if (isPureAnnotated(node)) {
        return;
      }
      const callee =
        node.type === "TaggedTemplateExpression" ? node.tag : node.callee;
      const dottedPath = getDottedPath(callee);
      if (dottedPath != null && FIRST_ARGUMENT_MUTATORS.has(dottedPath)) {
        const [mutated] = node.arguments || [];
        if (mutated != null) {
          reportMutationOf(mutated, node, mutated);
        }
        return;
      }
      if (isAllowlistedCallee(callee)) {
        return;
      }
      const root = getRoot(callee);
      const kind = classifyRoot(root);
      if (kind === "import") {
        const trusted =
          !inStatement &&
          (node.type === "NewExpression" ||
            isInternalModule(importBindings.get(root.name).module));
        if (!trusted) {
          context.report({
            node,
            messageId: "callOnImport",
            data: { callee: display(callee) },
          });
        }
      } else if (inStatement) {
        context.report({
          node,
          messageId: "callAtModuleScope",
          data: { callee: display(callee) },
        });
      }
    }

    function checkAssignment(node) {
      if (node.left.type === "Identifier") {
        if (classifyRoot(node.left) === "global") {
          context.report({
            node,
            messageId: "assignToGlobal",
            data: { target: display(node.left) },
          });
        }
      } else if (node.left.type === "MemberExpression") {
        reportMutationOf(node.left, node);
      }
    }

    function checkUpdate(node) {
      if (
        node.argument.type === "MemberExpression" ||
        classifyRoot(node.argument) === "global"
      ) {
        reportMutationOf(node.argument, node);
      }
    }

    function checkBareImport(node) {
      const source = node.source.value;
      const target = source.startsWith(".")
        ? normalizePath(path.resolve(path.dirname(filename), source))
        : source;
      if (sideEffectPaths.allows(target)) {
        return;
      }
      context.report({ node, messageId: "bareImport", data: { source } });
    }

    // An import with bindings keeps its target alive only while this file is kept,
    // so a target whose effect others depend on must not be reached this way.
    function checkBindingImport(node) {
      const source = node.source.value;
      const target = resolveImport(source, path.dirname(filename), sourceRoots);
      if (target == null || sideEffectPaths.allows(target)) {
        return;
      }
      const relative = normalizePath(path.relative(REPO_ROOT, target));
      const classification = classify(registry, relative);
      if (
        (classification === "global" || classification === "entry") &&
        !isFacade(registry, relative)
      ) {
        context.report({
          node,
          messageId: "importsGlobalEffect",
          data: { source },
        });
      }
    }

    // A listed package is reported the same way whether the import is bare or has bindings,
    // unless this file is a registration module, where loading it is the point.
    function checkImport(node) {
      const bare = node.specifiers.length === 0;
      if (!bare && isTypeOnly(node)) {
        return;
      }
      const source = node.source.value;
      if (
        !isInternalModule(source) &&
        classifyPackage(registry, source) === "global" &&
        !sideEffectPaths.allows(normalizePath(filename))
      ) {
        context.report({
          node,
          messageId: "importsGlobalEffectPackage",
          data: { source },
        });
      } else if (bare) {
        checkBareImport(node);
      } else {
        checkBindingImport(node);
      }
    }

    function checkTopLevelStatement(node) {
      if (node.type === "ImportDeclaration") {
        checkImport(node);
      } else if (CONTROL_FLOW_STATEMENTS.has(node.type)) {
        context.report({
          node,
          messageId: "controlFlow",
          data: { kind: statementKeyword(node) },
        });
      }
    }

    function collectBindings(node) {
      switch (node.type) {
        case "ImportDeclaration":
          for (const specifier of node.specifiers) {
            importBindings.set(specifier.local.name, {
              module: node.source.value,
              importedName: importedNameOf(specifier),
            });
          }
          return;
        case "VariableDeclaration":
          for (const declarator of node.declarations) {
            for (const name of patternNames(declarator.id)) {
              localNames.add(name);
            }
          }
          return;
        case "FunctionDeclaration":
        case "ClassDeclaration":
        case "TSEnumDeclaration":
        case "TSModuleDeclaration":
        case "TSDeclareFunction":
          if (node.id && node.id.type === "Identifier") {
            localNames.add(node.id.name);
          }
          return;
        case "ExportNamedDeclaration":
          if (node.declaration != null) {
            collectBindings(node.declaration);
          }
          return;
        case "ExportDefaultDeclaration":
          collectBindings(node.declaration);
          return;
        default:
          return;
      }
    }

    // Runs `check` on the node when it is evaluated at module scope.
    // The Program visitor has already collected the bindings by then.
    function atModuleScope(check) {
      return (node) => {
        const placement = placementOf(node);
        if (placement !== "skipped") {
          check(node, placement === "statement");
        }
      };
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          collectBindings(statement);
        }
        for (const statement of program.body) {
          checkTopLevelStatement(statement);
        }
      },
      CallExpression: atModuleScope(checkCall),
      NewExpression: atModuleScope(checkCall),
      TaggedTemplateExpression: atModuleScope(checkCall),
      ImportExpression: atModuleScope((node) => {
        context.report({
          node,
          messageId: "callAtModuleScope",
          data: { callee: "import()" },
        });
      }),
      AwaitExpression: atModuleScope((node) => {
        context.report({ node, messageId: "topLevelAwait" });
      }),
      AssignmentExpression: atModuleScope(checkAssignment),
      UpdateExpression: atModuleScope(checkUpdate),
      UnaryExpression: atModuleScope((node) => {
        if (node.operator === "delete") {
          reportMutationOf(node.argument, node);
        }
      }),
    };
  },
};

// Where an expression's value goes: "skipped" under a function, a class body or a control-flow statement,
// "statement" when it is discarded, "value" when it is kept.
function placementOf(node) {
  let placement = null;
  for (let current = node; current.parent != null; current = current.parent) {
    const { parent } = current;
    if (NOT_MODULE_SCOPE.has(parent.type)) {
      return "skipped";
    }
    if (placement == null && !discardsValueOf(parent, current)) {
      placement = parent.type === "ExpressionStatement" ? "statement" : "value";
    }
  }
  return placement ?? "value";
}

// Whether `parent` hands `child`'s value on unused, so an expression statement above still discards it.
function discardsValueOf(parent, child) {
  switch (parent.type) {
    case "SequenceExpression":
      return true;
    case "ConditionalExpression":
      return child !== parent.test;
    case "LogicalExpression":
      return child === parent.right;
    default:
      return EXPRESSION_WRAPPERS.has(parent.type);
  }
}

// The node and every TS wrapper or optional chain around it, innermost first.
function wrapperChain(node) {
  const chain = [node];
  let current = node;
  while (
    current.parent != null &&
    EXPRESSION_WRAPPERS.has(current.parent.type)
  ) {
    current = current.parent;
    chain.push(current);
  }
  return chain;
}

function unwrap(node) {
  let current = node;
  while (current != null && EXPRESSION_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

// The identifier an expression starts from: `a` for `a.b.c`, `a().b` and `(a as X)!.b?.c`.
// Null when there is none (a literal, `this`, an IIFE).
function getRoot(node) {
  let current = unwrap(node);
  while (current != null) {
    switch (current.type) {
      case "Identifier":
        return current;
      case "MemberExpression":
        current = unwrap(current.object);
        break;
      case "CallExpression":
      case "NewExpression":
        current = unwrap(current.callee);
        break;
      case "TaggedTemplateExpression":
        current = unwrap(current.tag);
        break;
      default:
        return null;
    }
  }
  return null;
}

// The root binding and the name called: `rem` for `rem(4)`, `extend` for `Button.extend({})`, `t` for `c("ctx").t\`\``.
function getCalleeInfo(callee) {
  const inner = unwrap(callee);
  if (inner == null) {
    return { root: null, name: null };
  }
  if (inner.type === "Identifier") {
    return { root: inner, name: inner.name };
  }
  if (inner.type === "MemberExpression") {
    const name =
      !inner.computed && inner.property.type === "Identifier"
        ? inner.property.name
        : null;
    return { root: getRoot(inner), name };
  }
  if (
    inner.type === "CallExpression" ||
    inner.type === "TaggedTemplateExpression"
  ) {
    return getCalleeInfo(inner.callee || inner.tag);
  }
  return { root: getRoot(inner), name: null };
}

// The dotted name of a plain member chain (`Object.assign`), null for anything else.
function getDottedPath(node) {
  const parts = [];
  let current = unwrap(node);
  while (current != null && current.type === "MemberExpression") {
    if (current.computed || current.property.type !== "Identifier") {
      return null;
    }
    parts.unshift(current.property.name);
    current = unwrap(current.object);
  }
  if (current == null || current.type !== "Identifier") {
    return null;
  }
  parts.unshift(current.name);
  return parts.join(".");
}

function importedNameOf(specifier) {
  switch (specifier.type) {
    case "ImportDefaultSpecifier":
      return "default";
    case "ImportNamespaceSpecifier":
      return "*";
    default:
      return specifier.imported.type === "Identifier"
        ? specifier.imported.name
        : String(specifier.imported.value);
  }
}

function patternNames(pattern) {
  switch (pattern.type) {
    case "Identifier":
      return [pattern.name];
    case "ObjectPattern":
      return pattern.properties.flatMap((property) =>
        property.type === "RestElement"
          ? patternNames(property.argument)
          : patternNames(property.value),
      );
    case "ArrayPattern":
      return pattern.elements.flatMap((element) =>
        element == null ? [] : patternNames(element),
      );
    case "AssignmentPattern":
      return patternNames(pattern.left);
    case "RestElement":
      return patternNames(pattern.argument);
    default:
      return [];
  }
}

function statementKeyword(node) {
  switch (node.type) {
    case "IfStatement":
      return "if";
    case "ForStatement":
    case "ForInStatement":
    case "ForOfStatement":
      return "for";
    case "WhileStatement":
    case "DoWhileStatement":
      return "while";
    case "TryStatement":
      return "try";
    case "SwitchStatement":
      return "switch";
    case "ThrowStatement":
      return "throw";
    case "DebuggerStatement":
      return "debugger";
    default:
      return "a block";
  }
}

function getRegistry(registryPath) {
  if (!registries.has(registryPath)) {
    registries.set(registryPath, loadRegistry(registryPath));
  }
  return registries.get(registryPath);
}

// A type-only import is erased, so nothing loads.
function isTypeOnly(node) {
  return (
    node.importKind === "type" ||
    node.specifiers.every((specifier) => specifier.importKind === "type")
  );
}

// The absolute file an import source names, or null when it is a package or does not resolve.
// A relative source is resolved from the importing file, any other under each source root in turn.
function resolveImport(source, fromDirectory, sourceRoots) {
  const bases = source.startsWith(".")
    ? [path.resolve(fromDirectory, source)]
    : sourceRoots.map((root) => path.join(root, source));
  for (const base of bases) {
    const file = resolveSourceFile(base);
    if (file != null) {
      return normalizePath(file);
    }
  }
  return null;
}

// `base`, `base.<ext>` or `base/index.<ext>`, whichever exists.
function resolveSourceFile(base) {
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ];
  return (
    candidates.find((candidate) => {
      try {
        return fs.statSync(candidate).isFile();
      } catch {
        return false;
      }
    }) ?? null
  );
}

// `metabase/lib/x` maps to `metabase`, `@scope/pkg/x` to `@scope/pkg`.
function packageNameOf(source) {
  const segments = source.split("/");
  return source.startsWith("@") ? segments.slice(0, 2).join("/") : segments[0];
}

function normalizePath(file) {
  return file.replaceAll("\\", "/");
}

function stripScriptExtension(file) {
  return file.replace(/\.[jt]sx?$/, "");
}

// A directory entry ends with a separator and covers every file under it.
function normalizeSideEffectPaths(paths) {
  const files = new Set();
  const directories = [];
  for (const entry of paths) {
    const absolute = normalizePath(path.resolve(entry));
    if (normalizePath(entry).endsWith("/")) {
      directories.push(`${absolute}/`);
    } else {
      files.add(absolute);
      files.add(stripScriptExtension(absolute));
    }
  }
  return {
    allows(target) {
      return (
        files.has(target) ||
        files.has(stripScriptExtension(target)) ||
        directories.some((directory) => target.startsWith(directory))
      );
    },
  };
}
