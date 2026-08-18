/**
 * @fileoverview Directories declared side-effect free for rspack (`sideEffects: false` in
 * frontend/build/shared/rspack/side-effect-free-modules.js) must not do work at import
 * time: production drops any file whose exports go unused, so an import-time effect in
 * one of them is silently lost. This walks module-scope statements only and reports the
 * ones that run at import: bare imports, calls, foreign member assignment, global writes,
 * control flow, and top-level await. Calls on an allowlisted pure callee, or annotated
 * `#__PURE__`, are fine. Which files are linted is decided by the config, not the rule.
 */

const path = require("path");

// Callees known to be pure, so a module-scope call to them is allowed without an
// annotation. `names` are the imported names, or the property called on any binding
// from the module (`Button.extend`, `React.memo`). Mantine's `X.extend(input)` is the
// identity config helper every *.config.ts calls. `Object.assign` is deliberately
// absent: whether it mutates shared state depends on its first argument, which the
// rule inspects, and any other use is annotated per site.
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

// Global helpers whose effect lands on their first argument, so the verdict follows
// that argument: fine on a same-file object, a mutation of shared state otherwise.
const FIRST_ARGUMENT_MUTATORS = new Set([
  "Object.assign",
  "Object.defineProperty",
  "Object.defineProperties",
  "Object.freeze",
  "Object.seal",
  "Object.preventExtensions",
  "Object.setPrototypeOf",
  "Reflect.set",
  "Reflect.defineProperty",
  "Reflect.deleteProperty",
  "Reflect.setPrototypeOf",
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

    function isInternalModule(source) {
      return (
        source.startsWith(".") || internalModules.has(packageNameOf(source))
      );
    }

    // Module-scope bindings, filled from the whole Program body before any statement
    // is judged, so a function declared below its call site still counts as local.
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

    function isPureAnnotated(node) {
      const comments = sourceCode.getCommentsBefore(node);
      return (
        comments.length > 0 &&
        PURE_ANNOTATION.test(comments[comments.length - 1].value)
      );
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

    // A call is judged by what its callee is rooted in. In a statement the result is
    // discarded, so every call not known pure is reported. In an initializer only a
    // call into a package is reported, since a relative or in-repo alias import is our
    // own code and trusted like a same-file call, and `new` builds a value like `new Map()`.
    function checkCall(node, outer, inStatement) {
      if (isPureAnnotated(node) || (outer !== node && isPureAnnotated(outer))) {
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

    // Walks an expression that is evaluated at import time. Function bodies are not
    // entered, they run later. `inStatement` is true when the expression's own value
    // is discarded, which is the whole reason a call there exists.
    function checkExpression(node, inStatement) {
      if (node == null) {
        return;
      }
      const inner = unwrap(node);
      switch (inner.type) {
        case "CallExpression":
        case "NewExpression":
        case "TaggedTemplateExpression":
          checkCall(inner, node, inStatement);
          checkExpression(
            inner.type === "TaggedTemplateExpression"
              ? inner.tag
              : inner.callee,
            false,
          );
          for (const argument of inner.arguments || []) {
            checkExpression(argument, false);
          }
          if (inner.quasi) {
            checkExpression(inner.quasi, false);
          }
          return;
        case "ImportExpression":
          context.report({
            node: inner,
            messageId: "callAtModuleScope",
            data: { callee: "import()" },
          });
          return;
        case "AwaitExpression":
          context.report({ node: inner, messageId: "topLevelAwait" });
          checkExpression(inner.argument, false);
          return;
        case "AssignmentExpression":
          if (inner.left.type === "Identifier") {
            if (classifyRoot(inner.left) === "global") {
              context.report({
                node: inner,
                messageId: "assignToGlobal",
                data: { target: display(inner.left) },
              });
            }
          } else if (inner.left.type === "MemberExpression") {
            reportMutationOf(inner.left, inner);
          }
          checkExpression(inner.right, false);
          return;
        case "UpdateExpression":
          if (
            inner.argument.type === "MemberExpression" ||
            classifyRoot(inner.argument) === "global"
          ) {
            reportMutationOf(inner.argument, inner);
          }
          return;
        case "UnaryExpression":
          if (inner.operator === "delete") {
            reportMutationOf(inner.argument, inner);
          } else {
            checkExpression(inner.argument, false);
          }
          return;
        case "MemberExpression":
          checkExpression(inner.object, false);
          if (inner.computed) {
            checkExpression(inner.property, false);
          }
          return;
        case "SequenceExpression":
          for (const expression of inner.expressions) {
            checkExpression(expression, inStatement);
          }
          return;
        case "ConditionalExpression":
          checkExpression(inner.test, false);
          checkExpression(inner.consequent, inStatement);
          checkExpression(inner.alternate, inStatement);
          return;
        case "LogicalExpression":
          checkExpression(inner.left, false);
          checkExpression(inner.right, inStatement);
          return;
        case "BinaryExpression":
          checkExpression(inner.left, false);
          checkExpression(inner.right, false);
          return;
        case "SpreadElement":
          checkExpression(inner.argument, false);
          return;
        case "ArrayExpression":
          for (const element of inner.elements) {
            checkExpression(element, false);
          }
          return;
        case "ObjectExpression":
          for (const property of inner.properties) {
            if (property.type === "SpreadElement") {
              checkExpression(property.argument, false);
            } else {
              if (property.computed) {
                checkExpression(property.key, false);
              }
              checkExpression(property.value, false);
            }
          }
          return;
        case "TemplateLiteral":
          for (const expression of inner.expressions) {
            checkExpression(expression, false);
          }
          return;
        case "ClassExpression":
          checkExpression(inner.superClass, false);
          return;
        default:
          return;
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

    function checkVariableDeclaration(node) {
      for (const declarator of node.declarations) {
        checkExpression(declarator.init, false);
      }
    }

    function checkStatement(node) {
      switch (node.type) {
        case "ImportDeclaration":
          if (node.specifiers.length === 0) {
            checkBareImport(node);
          }
          return;
        case "ExpressionStatement":
          if (!isDirective(node)) {
            checkExpression(node.expression, true);
          }
          return;
        case "VariableDeclaration":
          checkVariableDeclaration(node);
          return;
        case "ExportNamedDeclaration":
          if (node.declaration != null) {
            checkStatement(node.declaration);
          }
          return;
        case "ExportDefaultDeclaration":
          if (
            node.declaration.type !== "FunctionDeclaration" &&
            node.declaration.type !== "ClassDeclaration" &&
            node.declaration.type !== "TSInterfaceDeclaration"
          ) {
            checkExpression(node.declaration, false);
          }
          return;
        case "TSExportAssignment":
          checkExpression(node.expression, false);
          return;
        case "ClassDeclaration":
          checkExpression(node.superClass, false);
          return;
        default:
          if (CONTROL_FLOW_STATEMENTS.has(node.type)) {
            context.report({
              node,
              messageId: "controlFlow",
              data: { kind: statementKeyword(node) },
            });
          }
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

    return {
      Program(program) {
        for (const statement of program.body) {
          collectBindings(statement);
        }
        for (const statement of program.body) {
          checkStatement(statement);
        }
      },
    };
  },
};

function unwrap(node) {
  let current = node;
  while (current != null && EXPRESSION_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}

// The identifier an expression is ultimately rooted in: `a` for `a.b.c`, `a().b`,
// `(a as X)!.b?.c` and `a\`\``. Null when there is none (a literal, `this`, an IIFE).
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

// The root binding and the name that is called: `rem` for `rem(4)`, `extend` for
// `Button.extend({})`, `t` for `c("ctx").t\`\``, `styled` for `styled(Icon)\`\``.
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

// `Object.assign` for a plain dotted member chain of identifiers, null otherwise.
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

function isDirective(node) {
  return (
    node.directive != null ||
    (node.expression.type === "Literal" &&
      typeof node.expression.value === "string")
  );
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

// `@scope/name` or `name` for a bare specifier, so `metabase/lib/x` maps to `metabase`.
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

// A directory entry ends with a separator and allows every file under it.
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
