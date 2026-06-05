/**
 * Public types for the `useAction` hook surface.
 *
 * The hook is schema-agnostic — these types describe just the action kind
 * union and the discriminated `result` shape it drives. A future Data App
 * integration will layer schema-derived helpers (`ActionParametersFromDataAppSchema`,
 * `ActionKindFromDataAppSchema`) on top; they are NOT shipped from this
 * branch.
 */

import type { RowValue } from "metabase-types/api";

/**
 * Flat public kind union. Maps onto the backend's namespaced
 * `row/*` + `bulk/*` `implicitKind` and the `query` `type` value, but
 * exposes a simpler five-value surface to callers: `create` / `update` /
 * `delete` always refer to a single row, `bulk` covers any bulk variant,
 * and `query` covers custom SQL actions.
 *
 * @category useAction
 */
export type ActionKind = "create" | "update" | "delete" | "bulk" | "query";

/**
 * Response from a single-row create — the inserted row.
 *
 * @category useAction
 */
export type ActionResultForCreate = {
  "created-row": Record<string, RowValue>;
};

/**
 * Response from a single-row update — the affected primary keys.
 *
 * @category useAction
 */
export type ActionResultForUpdate = {
  "rows-updated": readonly RowValue[];
};

/**
 * Response from a single-row delete — the affected primary keys.
 *
 * @category useAction
 */
export type ActionResultForDelete = {
  "rows-deleted": readonly RowValue[];
};

/**
 * Response from any bulk variant — a success flag plus optional counts.
 *
 * @category useAction
 */
export type ActionResultForBulk = {
  success: boolean;
  "rows-created"?: number;
  "rows-updated"?: number;
  "rows-deleted"?: number;
};

/**
 * Response from a custom SQL action — the affected row count.
 *
 * @category useAction
 */
export type ActionResultForQuery = {
  "rows-affected": number;
};

/**
 * Union of every possible response body. Used as the `result` default when
 * `TKind` is omitted, so authors who don't know the action's kind upfront
 * still get TS-narrowable shapes (via `"<key>" in result`) instead of a
 * permissive `Record<string, unknown>` that swallows mistyped reads.
 *
 * @category useAction
 */
export type AnyActionResult =
  | ActionResultForCreate
  | ActionResultForUpdate
  | ActionResultForDelete
  | ActionResultForBulk
  | ActionResultForQuery;

/**
 * Shape of the thrown error captured into the hook's `error` state on a
 * non-2xx response. The hook types `error` as `unknown` so consumers must
 * narrow before reading — use this type as the expected shape:
 *
 *     const message = (error as ActionExecuteError | null)?.data?.message;
 *
 * `error.data.message` is the actionable diagnostic for end users.
 *
 * @category useAction
 */
export type ActionExecuteError = {
  status?: number;
  data: {
    message?: string;
  };
  isCancelled: boolean;
};

/**
 * Maps an `ActionKind` literal to the discriminated `result` shape. Omit
 * `TKind` (`undefined`) to fall back to the `AnyActionResult` union.
 *
 * @category useAction
 */
export type ActionResultForKind<TKind extends ActionKind | undefined> =
  TKind extends "create"
    ? ActionResultForCreate
    : TKind extends "update"
      ? ActionResultForUpdate
      : TKind extends "delete"
        ? ActionResultForDelete
        : TKind extends "bulk"
          ? ActionResultForBulk
          : TKind extends "query"
            ? ActionResultForQuery
            : AnyActionResult;
