import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";

export type NewQueryMode = "ai" | "notebook" | "sql";

const STORAGE_KEY = "proto-new-query-mode";

export function getLastNewQueryMode(): NewQueryMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "notebook" || stored === "sql" || stored === "ai") {
    return stored;
  }
  return "ai";
}

export function setLastNewQueryMode(mode: NewQueryMode) {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function parseNewQueryMode(pathname: string): NewQueryMode | null {
  if (pathname === "/question/new/notebook") {
    return "notebook";
  }
  if (pathname === "/question/new/sql") {
    return "sql";
  }
  if (pathname === "/question/new") {
    return "ai";
  }
  return null;
}

export function newQueryUrl(
  mode: NewQueryMode = getLastNewQueryMode(),
  { databaseId }: { databaseId?: number } = {},
): string {
  if (mode === "ai") {
    return "/question/new";
  }
  if (mode === "notebook") {
    return Urls.newQuestion({ mode: "notebook" }).replace(
      /^\/question\/notebook/,
      "/question/new/notebook",
    );
  }
  return Urls.newQuestion({
    DEPRECATED_RAW_MBQL_type: "native",
    creationType: "native_question",
    cardType: "question",
    DEPRECATED_RAW_MBQL_databaseId: databaseId,
  }).replace(/^\/question/, "/question/new/sql");
}

/** True on the New Query SQL page before the user has typed anything. */
export function isNewQuerySqlIdle(
  pathname: string,
  question: Question | undefined,
): boolean {
  if (parseNewQueryMode(pathname) !== "sql" || !question) {
    return false;
  }
  const { isNative } = Lib.queryDisplayInfo(question.query());
  return isNative && Lib.rawNativeQuery(question.query()).trim().length === 0;
}

// Bridge between NewQueryPage and the native editor visibility toggler.
// The toggler lives deep inside QueryBuilder, so we use a tiny external
// store instead of threading props through the QB tree.
let newQuerySqlFullPage = false;
const newQuerySqlFullPageListeners = new Set<() => void>();
let newQuerySqlExpandListener: (() => void) | null = null;

export function subscribeNewQuerySqlFullPage(listener: () => void) {
  newQuerySqlFullPageListeners.add(listener);
  return () => {
    newQuerySqlFullPageListeners.delete(listener);
  };
}

export function getNewQuerySqlFullPage() {
  return newQuerySqlFullPage;
}

export function setNewQuerySqlFullPage(value: boolean) {
  if (newQuerySqlFullPage === value) {
    return;
  }
  newQuerySqlFullPage = value;
  newQuerySqlFullPageListeners.forEach((listener) => listener());
}

export function setNewQuerySqlExpandListener(listener: (() => void) | null) {
  newQuerySqlExpandListener = listener;
}

export function requestNewQuerySqlExpand() {
  newQuerySqlExpandListener?.();
}
