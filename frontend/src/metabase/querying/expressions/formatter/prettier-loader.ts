/**
 * Lazy-loaded wrapper for prettier to avoid bundling it in the main chunk.
 * This module dynamically imports prettier only when formatting is needed.
 */

import type { AstPath, Doc, ParserOptions, Plugin } from "prettier";

export type { AstPath, Doc, ParserOptions, Plugin };

type PrettierModule = {
  format: (source: string, options: any) => Promise<string>;
};

type PrettierDocModule = {
  builders: {
    join: (...args: any[]) => Doc;
    indent: (...args: any[]) => Doc;
    softline: Doc;
    line: Doc;
    group: (...args: any[]) => Doc;
    ifBreak: (...args: any[]) => Doc;
  };
};

let prettierPromise: Promise<PrettierModule> | null = null;
let prettierDocPromise: Promise<PrettierDocModule> | null = null;

/**
 * Lazy load prettier/standalone module
 */
function loadPrettier(): Promise<PrettierModule> {
  if (!prettierPromise) {
    prettierPromise = import(
      /* webpackChunkName: "prettier" */
      "prettier/standalone"
    );
  }
  return prettierPromise;
}

/**
 * Lazy load prettier/doc module
 */
function loadPrettierDoc(): Promise<PrettierDocModule> {
  if (!prettierDocPromise) {
    prettierDocPromise = import(
      /* webpackChunkName: "prettier" */
      "prettier/doc"
    );
  }
  return prettierDocPromise;
}

/**
 * Format code using prettier (lazy loaded)
 */
export async function format(source: string, options: any): Promise<string> {
  const prettier = await loadPrettier();
  return prettier.format(source, options);
}

/**
 * Get prettier doc builders (lazy loaded)
 */
export async function getBuilders() {
  const prettierDoc = await loadPrettierDoc();
  return prettierDoc.builders;
}
