// Reports code that runs at import time in a file declared side-effect free.
// Rspack drops unused files in SIDE_EFFECT_FREE_PATHS from production bundles, so import-time work there is lost.
// eslint.config.mjs applies the rule to those directories automatically.

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

const DEFAULT_SOURCE_ROOTS = ["frontend/src", "enterprise/frontend/src"];

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

const registries = new Map();

// Calls to these only return a value, so a module-scope call to them is not reported.
// A name matches the imported binding or a property called on it (`memo`, `Button.extend`).
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
  { module: "@lezer/lr", names: ["deserialize"] },
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

// These change their first argument, so it is the argument that gets judged.
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

// Function bodies run later, class bodies are not inspected, and a control-flow statement is reported once as a whole.
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
            // Absolute file paths, or directories with a trailing separator.
            items: { type: "string" },
          },
          internalModules: {
            type: "array",
            // Alias roots that resolve inside the repo, such as "metabase".
            items: { type: "string" },
          },
          sideEffectRegistry: {
            // Default frontend/lint/side-effect-files.json.
            type: "string",
          },
          sourceRoots: {
            type: "array",
            // Default the tsconfig `*` roots.
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bareImport:
        "`import '{{source}}'` loads that file only for what it does at import, so move that work into a file listed in SIDE_EFFECT_PATHS or import it from an app entry.",
      callOnImport:
        "`{{callee}}` is called at import time, so mark it `/* #__PURE__ */` or add it to pureCallees if it only returns a value, otherwise move it inside a function.",
      callAtModuleScope:
        "`{{callee}}` is called at import time with its result unused, so move it inside a function or into a file listed in SIDE_EFFECT_PATHS.",
      assignToImport:
        "`{{target}}` is an import changed at import time, so move the change into a file listed in SIDE_EFFECT_PATHS.",
      assignToGlobal:
        "`{{target}}` is global state written at import time, so move the write into a file listed in SIDE_EFFECT_PATHS or an app entry.",
      topLevelAwait:
        "Top-level await runs at import time, so move it into a function called from an app entry.",
      controlFlow:
        "`{{kind}}` at module scope runs at import time, so move it inside a function or into a file listed in SIDE_EFFECT_PATHS.",
      importsGlobalEffect:
        "'{{source}}' does work at import that code outside it relies on, so import it from an app entry or list this file in SIDE_EFFECT_PATHS.",
      importsGlobalEffectPackage:
        "'{{source}}' does work at import that code outside it relies on, so import it from an app entry or through the vendor's facade.",
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

    // A call whose result is kept is reported only when it goes into a third-party package, our own code and `new` are trusted to only return a value.
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

    // A file imported with bindings is dropped from the bundle together with this file.
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

// "skipped" under a function, a class body or a control-flow statement, "statement" when the value is thrown away, "value" when it is kept.
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

// Whether `parent` passes `child`'s value straight through.
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

function isTypeOnly(node) {
  return (
    node.importKind === "type" ||
    node.specifiers.every((specifier) => specifier.importKind === "type")
  );
}

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
