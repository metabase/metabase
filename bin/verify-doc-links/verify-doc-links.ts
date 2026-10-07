#!/usr/bin/env bun
/* eslint-disable no-console */
import { existsSync, readFileSync } from "fs";

import { sync as globSync } from "glob";
import ts from "typescript";

type ArgPosition = number | [index: number, property: string];

// verify-doc-links.unit.spec.ts imports these helpers, so renaming one fails that spec.
export const DOCS_URL_HELPERS: Record<
  string,
  { page: ArgPosition; anchor: ArgPosition }
> = {
  useDocsUrl: { page: 0, anchor: [1, "anchor"] },
  getDocsUrl: { page: [1, "page"], anchor: [1, "anchor"] },
  getDocsUrlForVersion: { page: 1, anchor: 2 },
};

export type DocsLink = { line: number; page: string; anchor?: string };

const literalText = (node: ts.Node | undefined) =>
  node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text
    : undefined;

const argAt = (call: ts.CallExpression, position: ArgPosition) => {
  if (typeof position === "number") {
    return literalText(call.arguments[position]);
  }
  const [index, property] = position;
  const arg = call.arguments[index];
  if (!arg || !ts.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const prop = arg.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) && p.name.getText() === property,
  );
  return literalText(prop?.initializer);
};

// Calls whose page isn't a literal (a variable, a template with ${}) are skipped.
export function extractDocsLinks(fileName: string, text: string): DocsLink[] {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const links: DocsLink[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const helper = DOCS_URL_HELPERS[node.expression.text];
      const page = helper && argAt(node, helper.page);
      if (page) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart());
        links.push({
          line: line + 1,
          page,
          anchor: argAt(node, helper.anchor),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return links;
}

// Same ids as GitHub: the docs site keeps leading digits and underscores ("2. Add `MB_API_KEY`"
// becomes "2-add-mb_api_key"), and drops the markers around _emphasis_.
export function headingIds(markdown: string): Set<string> {
  const ids = new Set<string>();
  let inFence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
    }
    const heading = !inFence && line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!heading) {
      continue;
    }
    const explicit = heading[1].match(/\{#([^}\s]+)}\s*$/);
    if (explicit) {
      ids.add(explicit[1]);
      continue;
    }
    const base =
      heading[1]
        .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
        .replace(/[`*]|\b_|_\b/g, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
        .replace(/ /g, "-");
    let id = base;
    for (let n = 1; ids.has(id); n++) {
      id = `${base}-${n}`;
    }
    ids.add(id);
  }
  return ids;
}

export function checkLink({ page, anchor }: DocsLink, docsDir = "docs") {
  const path = `${docsDir}/${page.replace(/\.html$/, "")}.md`;
  if (!existsSync(path)) {
    return `${path} doesn't exist (if the page moved, the new page lists the old path under redirect_from)`;
  }
  if (anchor && !headingIds(readFileSync(path, "utf-8")).has(anchor)) {
    return `${path} has no heading with id #${anchor}`;
  }
  return undefined;
}

const main = () => {
  const staged = process.argv.slice(2);
  const files = staged.length
    ? staged
    : globSync("{enterprise/,}frontend/src/**/*.{js,jsx,ts,tsx}", {
        ignore: ["**/*.unit.spec.*", "**/*.stories.*"],
      });

  let checked = 0;
  let broken = 0;
  for (const file of files) {
    for (const link of extractDocsLinks(file, readFileSync(file, "utf-8"))) {
      checked++;
      const error = checkLink(link);
      if (error) {
        broken++;
        const target = link.anchor ? `${link.page}#${link.anchor}` : link.page;
        console.log(`${file}:${link.line}: ${target}: ${error}`);
      }
    }
  }

  // A full run that finds nothing means the helpers changed shape, not that every link is fine.
  if (!staged.length && checked === 0) {
    console.log(
      "Found no docs links. Update DOCS_URL_HELPERS in bin/verify-doc-links/verify-doc-links.ts.",
    );
    process.exit(1);
  }
  console.log(`Checked ${checked} docs links, ${broken} broken`);
  process.exit(broken ? 1 : 0);
};

if (require.main === module) {
  main();
}
