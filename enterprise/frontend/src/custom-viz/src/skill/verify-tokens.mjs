#!/usr/bin/env node
import { createRequire } from "node:module";
import { relative, resolve } from "node:path";

import { BLOCKED_DOM_APIS } from "./blocked-apis.mjs";
import {
  BLOCKED_TAGS,
  GLOBAL_BLOCKED_EVENT_TYPES,
} from "./references/blocklists.mjs";

const ts = createRequire(resolve("package.json"))("typescript");

const program = ts.createProgram([process.argv[2] ?? "src/index.tsx"], {
  jsx: ts.JsxEmit.Preserve,
  target: ts.ScriptTarget.Latest,
});
const checker = program.getTypeChecker();

const apiNames = (node) => {
  if (ts.isPropertyAccessExpression(node)) {
    return [node.getText()];
  }
  if (!ts.isIdentifier(node)) {
    return [];
  }
  const symbol = checker.getSymbolAtLocation(node);
  return (symbol?.declarations ?? [])
    .filter((d) => program.isSourceFileDefaultLibrary(d.getSourceFile()))
    .map(({ parent }) =>
      ts.isInterfaceDeclaration(parent)
        ? `${parent.name.text}.${symbol.name}`
        : symbol.name,
    );
};

const usesBlockedDomApi = (node) =>
  apiNames(node).find((name) => BLOCKED_DOM_APIS.has(name));

const isBlockedTag = (tag) => BLOCKED_TAGS.has(tag.toLowerCase());

const rendersBlockedJsxTag = (node) => {
  if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
    return undefined;
  }
  const tag = node.tagName.getText();
  return isBlockedTag(tag) ? `<${tag}>` : undefined;
};

const methodCall = (node, methods) =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  methods.includes(node.expression.name.text)
    ? {
        receiver: node.expression.expression,
        args: node.arguments
          .filter(ts.isStringLiteralLike)
          .map((arg) => arg.text),
      }
    : undefined;

const createsBlockedTag = (node) => {
  const call = methodCall(node, ["createElement", "createElementNS"]);
  const tag = call?.args.find(isBlockedTag);
  return tag && `createElement("${tag}")`;
};

const listensToBlockedGlobalEvent = (node) => {
  const call = methodCall(node, ["addEventListener"]);
  if (
    !call ||
    !ts.isIdentifier(call.receiver) ||
    !["window", "document"].includes(call.receiver.text)
  ) {
    return undefined;
  }
  const type = call.args.find((arg) => GLOBAL_BLOCKED_EVENT_TYPES.has(arg));
  return type && `${call.receiver.text}.addEventListener("${type}")`;
};

const CHECKS = [
  usesBlockedDomApi,
  rendersBlockedJsxTag,
  createsBlockedTag,
  listensToBlockedGlobalEvent,
];

const findBlocked = (node) => CHECKS.map((check) => check(node)).find(Boolean);

const findings = [];
const visit = (file) => (node) => {
  const blocked = findBlocked(node);
  if (blocked) {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    findings.push(
      `${relative(".", file.fileName)}:${line + 1} blocked in sandbox: ${blocked}`,
    );
  }
  ts.forEachChild(node, visit(file));
};
program
  .getSourceFiles()
  .filter(
    (file) =>
      !program.isSourceFileFromExternalLibrary(file) && !file.isDeclarationFile,
  )
  .forEach((file) => visit(file)(file));

if (findings.length) {
  console.error(findings.join("\n"));
  console.error("\nSee references/sandbox-substitutes.md next to this script.");
  process.exit(1);
}
console.log("verify-tokens: OK");
