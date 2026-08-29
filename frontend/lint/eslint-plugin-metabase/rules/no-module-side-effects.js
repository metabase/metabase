// Reports code that runs at import time in a file rspack treats as side-effect-free.
// Rspack drops such a file from production bundles when nothing uses its exports, so anything it does at import is lost.

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

// Calls to these only return a value, so we don't report them at module scope.
// A name matches the imported binding or a property called on it, so `extend` covers `Button.extend`.
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
      "combineReducers",
      "createSelector",
      "createReducer",
      "createAction",
      "createSlice",
      "createAsyncThunk",
      "createEntityAdapter",
    ],
  },
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

// `Object.assign` and these others change their first argument, so we report on the argument rather than the call.
const MUTATING_OBJECT_METHODS = new Set([
  "assign",
  "defineProperty",
  "defineProperties",
  "freeze",
  "seal",
]);

// A control-flow statement at module scope is reported once as a whole, under the keyword the message names.
const CONTROL_FLOW_KEYWORDS = {
  IfStatement: "if",
  ForStatement: "for",
  ForInStatement: "for",
  ForOfStatement: "for",
  WhileStatement: "while",
  DoWhileStatement: "while",
  TryStatement: "try",
  SwitchStatement: "switch",
  ThrowStatement: "throw",
  DebuggerStatement: "debugger",
  LabeledStatement: "a block",
  BlockStatement: "a block",
};

// Anything under one of these is skipped: function bodies run later, class bodies aren't inspected, and a control-flow statement is already reported as a whole.
const NOT_MODULE_SCOPE = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "TSDeclareFunction",
  "MethodDefinition",
  "PropertyDefinition",
  "AccessorProperty",
  "StaticBlock",
  ...Object.keys(CONTROL_FLOW_KEYWORDS),
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
            // Import roots that resolve inside the repo, such as "metabase".
            items: { type: "string" },
          },
          sideEffectRegistry: {
            // Defaults to frontend/lint/side-effect-files.json.
            type: "string",
          },
          sourceRoots: {
            type: "array",
            // Defaults to the tsconfig `*` roots.
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      bareImport:
        "`import '{{source}}'` is only there for what the file does at import, so move that work into a file in SIDE_EFFECT_PATHS or import it from an app entry.",
      callOnImport:
        "`{{callee}}` runs at import time. If it only returns a value, mark it `/* #__PURE__ */` or add it to pureCallees, otherwise move it inside a function.",
      callAtModuleScope:
        "`{{callee}}` runs at import time and its result is thrown away, so move it inside a function or into a file in SIDE_EFFECT_PATHS.",
      assignToImport:
        "`{{target}}` is an import that gets changed at import time, so move the change into a file in SIDE_EFFECT_PATHS.",
      assignToGlobal:
        "`{{target}}` is global state written at import time, so move the write into a file in SIDE_EFFECT_PATHS or an app entry.",
      topLevelAwait:
        "Top-level await runs at import time, so move it into a function called from an app entry.",
      controlFlow:
        "`{{kind}}` at module scope runs at import time, so move it inside a function or into a file in SIDE_EFFECT_PATHS.",
      importsGlobalEffect:
        "'{{source}}' does work at import that code outside it relies on, so import it from an app entry or add this file to SIDE_EFFECT_PATHS.",
      importsGlobalEffectPackage:
        "'{{source}}' does work at import that code outside it relies on, so import it from an app entry or through the vendor's facade.",
    },
  },

  create(context) {
    const { sourceCode, filename } = context;
    const options = context.options[0] || {};
    const pureCallees = [
      ...DEFAULT_PURE_CALLEES,
      ...(options.pureCallees || []),
    ];
    const isSideEffectPath = sideEffectPathMatcher(
      options.sideEffectPaths || [],
    );
    const internalModules = new Set(options.internalModules || []);
    const registry = getRegistry(
      options.sideEffectRegistry || DEFAULT_REGISTRY_PATH,
    );
    const sourceRoots = (options.sourceRoots || DEFAULT_SOURCE_ROOTS).map(
      (root) => path.resolve(REPO_ROOT, root),
    );
    // getScope() on the Program node returns the outer global scope, so ask the scope manager for the module scope itself.
    const moduleScope = sourceCode.scopeManager.acquire(sourceCode.ast, true);

    function isInternalModule(source) {
      return (
        source.startsWith(".") || internalModules.has(packageNameOf(source))
      );
    }

    // The import a module-scope name refers to, or null when this file declares the name or it is a global.
    function importOf(name) {
      const def = moduleScope.set
        .get(name)
        ?.defs.find(
          (def) =>
            def.type === "ImportBinding" &&
            def.parent.type === "ImportDeclaration",
        );
      return def == null
        ? null
        : {
            module: def.parent.source.value,
            importedName: importedNameOf(def.node),
          };
    }

    function isDeclaredHere(name) {
      return moduleScope.set.has(name) && importOf(name) == null;
    }

    // The annotation may sit on the call or on a wrapper around it (`/* #__PURE__ */ foo()!`).
    function isPureAnnotated(node) {
      let current = node;
      while (current != null) {
        const comments = sourceCode.getCommentsBefore(current);
        if (
          comments.length > 0 &&
          PURE_ANNOTATION.test(comments[comments.length - 1].value)
        ) {
          return true;
        }
        current = EXPRESSION_WRAPPERS.has(current.parent.type)
          ? current.parent
          : null;
      }
      return false;
    }

    function isPureCallee(callee, root, binding) {
      const name = calledName(callee);
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

    function reportMutationOf(target, node) {
      const root = getRoot(target);
      if (root == null || isDeclaredHere(root.name)) {
        return;
      }
      context.report({
        node,
        messageId:
          importOf(root.name) == null ? "assignToGlobal" : "assignToImport",
        data: { target: display(target) },
      });
    }

    // A call whose result is kept is only reported when it goes into a third-party package, since we trust our own code and `new` to only return a value.
    function checkCall(node) {
      if (isPureAnnotated(node)) {
        return;
      }
      const callee =
        node.type === "TaggedTemplateExpression" ? node.tag : node.callee;
      const root = getRoot(callee);
      if (
        root?.name === "Object" &&
        MUTATING_OBJECT_METHODS.has(calledName(callee))
      ) {
        const [mutated] = node.arguments;
        if (mutated != null) {
          reportMutationOf(mutated, node);
        }
        return;
      }
      const binding = root == null ? null : importOf(root.name);
      if (binding == null) {
        if (isDiscarded(node)) {
          context.report({
            node,
            messageId: "callAtModuleScope",
            data: { callee: display(callee) },
          });
        }
        return;
      }
      if (isPureCallee(callee, root, binding)) {
        return;
      }
      const returnsValue =
        node.type === "NewExpression" || isInternalModule(binding.module);
      if (isDiscarded(node) || !returnsValue) {
        context.report({
          node,
          messageId: "callOnImport",
          data: { callee: display(callee) },
        });
      }
    }

    function checkBareImport(node) {
      const source = node.source.value;
      const target = source.startsWith(".")
        ? normalizePath(path.resolve(path.dirname(filename), source))
        : source;
      if (!isSideEffectPath(target)) {
        context.report({ node, messageId: "bareImport", data: { source } });
      }
    }

    // A file imported for its bindings is dropped from the bundle along with this file.
    function checkBindingImport(node) {
      const source = node.source.value;
      const target = resolveImport(source, path.dirname(filename), sourceRoots);
      if (target == null || isSideEffectPath(target)) {
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
        !isSideEffectPath(normalizePath(filename))
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

    function atModuleScope(check) {
      return (node) => {
        const ancestors = sourceCode.getAncestors(node);
        if (
          !ancestors.some((ancestor) => NOT_MODULE_SCOPE.has(ancestor.type))
        ) {
          check(node);
        }
      };
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          if (statement.type === "ImportDeclaration") {
            checkImport(statement);
          } else if (statement.type in CONTROL_FLOW_KEYWORDS) {
            context.report({
              node: statement,
              messageId: "controlFlow",
              data: { kind: CONTROL_FLOW_KEYWORDS[statement.type] },
            });
          }
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
      AssignmentExpression: atModuleScope((node) => {
        reportMutationOf(node.left, node);
      }),
      UpdateExpression: atModuleScope((node) => {
        reportMutationOf(node.argument, node);
      }),
      UnaryExpression: atModuleScope((node) => {
        if (node.operator === "delete") {
          reportMutationOf(node.argument, node);
        }
      }),
    };
  },
};

// Whether the value of `node` is thrown away, looking through the parents that only pass it along.
function isDiscarded(node) {
  let current = node;
  while (forwardsValueOf(current.parent, current)) {
    current = current.parent;
  }
  return current.parent.type === "ExpressionStatement";
}

// Whether `parent` passes `child`'s value straight through.
function forwardsValueOf(parent, child) {
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

function unwrap(node) {
  let current = node;
  while (EXPRESSION_WRAPPERS.has(current.type)) {
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

// The name a callee is called by: `rem` for `rem(4)`, `extend` for `Button.extend({})`, `t` for `c("ctx").t\`\``.
function calledName(callee) {
  const inner = unwrap(callee);
  switch (inner.type) {
    case "Identifier":
      return inner.name;
    case "MemberExpression":
      return !inner.computed && inner.property.type === "Identifier"
        ? inner.property.name
        : null;
    case "CallExpression":
      return calledName(inner.callee);
    case "TaggedTemplateExpression":
      return calledName(inner.tag);
    default:
      return null;
  }
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

// A directory entry ends with a separator and covers every file under it, and a file entry matches with or without its extension.
function sideEffectPathMatcher(entries) {
  const paths = entries.map(normalizePath);
  const directories = paths.filter((entry) => entry.endsWith("/"));
  const files = new Set(
    paths.filter((entry) => !entry.endsWith("/")).map(stripScriptExtension),
  );
  return (target) =>
    files.has(stripScriptExtension(target)) ||
    directories.some((directory) => target.startsWith(directory));
}
