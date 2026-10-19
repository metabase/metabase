/* eslint-env node */

/**
 * Where a plugin slot gets its value.
 *
 * A plugin registers its routes by writing them to a slot at runtime, so the
 * route tree only names the slot and nothing in the file it sits in says what
 * lands there. This indexes the writes, so a name like
 * `PLUGIN_TENANTS.tenantUsersList` can be followed to the routes it holds.
 *
 * The index is keyed by what the route tree asks for, so it needs no list of
 * slots or plugins. A write in a shape it cannot read is reported rather than
 * dropped, and the caller turns that into a failure.
 */
const fs = require("fs");
const path = require("path");

const ts = require("typescript");

const SLOT_NAME = /^PLUGIN_[A-Z0-9_]+$/;
// Cheap enough to run over every file, so only the few that could write a slot
// are parsed.
const MENTIONS_A_WRITE =
  /PLUGIN_[A-Z0-9_]+\s*\.\s*(?:[A-Za-z]\w*\s*=[^=]|push\s*\()/;

const SOURCE_DIRS = ["frontend/src", "enterprise/frontend/src"];
const EXTENSIONS = new Set([".ts", ".tsx"]);

function* filesUnder(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* filesUnder(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

const isSlot = (node) =>
  node.type === undefined && ts.isIdentifier(node) && SLOT_NAME.test(node.text);

/** `PLUGIN_X.member`, as the key the route tree asks for. */
function memberKey(expression) {
  if (
    !ts.isPropertyAccessExpression(expression) ||
    !ts.isIdentifier(expression.expression) ||
    !SLOT_NAME.test(expression.expression.text)
  ) {
    return null;
  }
  return `${expression.expression.text}.${expression.name.text}`;
}

/**
 * @returns {{ writes: Map<string, Array<{ value: import("typescript").Node, file: string }>> }}
 */
function readSlotWrites(root) {
  const writes = new Map();

  const record = (key, value, file) => {
    const found = writes.get(key) ?? [];
    found.push({ value, file });
    writes.set(key, found);
  };

  for (const dir of SOURCE_DIRS) {
    const base = path.join(root, dir);
    if (!fs.existsSync(base)) {
      continue;
    }
    for (const file of filesUnder(base)) {
      const text = fs.readFileSync(file, "utf8");
      if (!MENTIONS_A_WRITE.test(text)) {
        continue;
      }

      const source = ts.createSourceFile(
        file,
        text,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );

      const visit = (node) => {
        // `PLUGIN_X.member = value`
        if (
          ts.isBinaryExpression(node) &&
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
          const key = memberKey(node.left);
          if (key) {
            record(key, node.right, file);
          }
        }

        // `PLUGIN_X.push(value)` fills an array-shaped slot.
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === "push" &&
          ts.isIdentifier(node.expression.expression) &&
          SLOT_NAME.test(node.expression.expression.text)
        ) {
          for (const argument of node.arguments) {
            record(node.expression.expression.text, argument, file);
          }
        }

        ts.forEachChild(node, visit);
      };

      visit(source);
    }
  }

  return { writes };
}

module.exports = { readSlotWrites, isSlot };
