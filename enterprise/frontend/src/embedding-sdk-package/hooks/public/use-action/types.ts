/**
 * Public types for the `useAction` hook surface.
 *
 * The hook itself is schema-agnostic — the `ActionKind` union and the
 * discriminated `ActionResultForKind` shape it drives describe just the
 * kind / response surface. The `…FromDataAppSchema` helpers below layer on
 * top, deriving the hook's `TParameters` / `TKind` generics from a
 * generated `metabase.data.ts` schema entry; the hook never sees the
 * schema directly.
 */

import type { RowValue } from "metabase-types/api";

import type { SchemaColumn, SchemaJavaScriptType } from "../data-schema";

/**
 * Flat public kind union. Maps onto the backend's namespaced
 * `row/*` + `bulk/*` `implicitKind` and the `query` `type` value, but
 * exposes a simpler five-value surface to callers: `create` / `update` /
 * `delete` always refer to a single row, `bulk` covers any bulk variant,
 * and `sql` covers custom SQL actions (the backend's `query`-type action).
 *
 * @category useAction
 */
export type ActionKind = "create" | "update" | "delete" | "bulk" | "sql";

/**
 * Response from a single-row create — the inserted row.
 *
 * @category useAction
 * @notExported RowValue
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
export type ActionResultForSql = {
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
  | ActionResultForSql;

/**
 * Shape of the thrown error captured into the hook's `error` state on a
 * non-2xx response. The hook types `error` as `ActionExecuteError | null`,
 * so consumers read its fields directly — no cast needed:
 *
 *     const message = error?.data?.message;
 *
 * `error.data.message` is the actionable diagnostic for end users.
 * `error.data.errors` is a per-field map (`{ <slug>: <message> }`) when the
 * backend reports parameter-level validation failures; it is `{}` for
 * whole-request failures (e.g. a foreign-key constraint:
 * `{ message: "Other rows refer to this row…", errors: {} }`).
 * `status` is absent for transport-layer failures (offline, aborted) where
 * no HTTP response was received.
 *
 * @category useAction
 */
export type ActionExecuteError = {
  status?: number;
  data: {
    message?: string;
    errors?: Record<string, string>;
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
          : TKind extends "sql"
            ? ActionResultForSql
            : AnyActionResult;

// ============================================================================
// Data App schema-derived helpers
// ----------------------------------------------------------------------------
// These layer on top of the schema-agnostic types above. They read the shape
// of a single action entry in a generated `metabase.data.ts` schema and
// derive the hook's `TParameters` / `TKind` generics, so a Data App author
// writes `useAction<ActionParametersFromDataAppSchema<typeof action>,
// ActionKindFromDataAppSchema<typeof action>>(action.id)` and gets
// compile-time parameter checking plus a typed `result` with no casts.
// Mode-1 (raw SDK) callers don't import these — they declare `TParameters`
// by hand and pass `TKind` as a literal.
// ============================================================================

/**
 * Backend-namespaced `implicitKind` values for basic actions. Mapped onto
 * the flat `ActionKind` union by `ActionKindFromDataAppSchema`.
 *
 * @category useAction
 */
export type ActionImplicitKind =
  | "row/create"
  | "row/update"
  | "row/delete"
  | "bulk/create"
  | "bulk/update"
  | "bulk/delete";

/**
 * Shape of a single action parameter as it appears in a generated
 * `metabase.data.ts` schema entry.
 *
 * @category useAction
 */
export type ActionParameterSchema = SchemaColumn & {
  slug: string;
  required?: boolean;
};

/**
 * Shape of a single action entry in a generated `metabase.data.ts` schema.
 * The `id` is the numeric action id passed to `useAction`; `parameters`
 * drives `ActionParametersFromDataAppSchema`; `implicitKind` / `type` drive
 * `ActionKindFromDataAppSchema`.
 *
 * @category useAction
 */
export type ActionSchema = {
  kind?: "action";
  id: number;
  name?: string;
  type?: "query" | "implicit";
  implicitKind?: ActionImplicitKind;
  parameters: readonly ActionParameterSchema[];
  description?: string;
  entityId?: string;
};

/** TS value type for a single action parameter, derived from its `jsType`. */
type ActionParamValue<TParam extends { jsType?: SchemaJavaScriptType }> =
  TParam["jsType"] extends "string"
    ? string | null
    : TParam["jsType"] extends "number"
      ? number | null
      : TParam["jsType"] extends "boolean"
        ? boolean | null
        : TParam["jsType"] extends "Date"
          ? string | Date | null
          : RowValue | null;

/**
 * Walks a schema entry's `parameters` tuple and produces an object keyed by
 * slug. Parameters with `required: true` become required keys; everything
 * else is optional. Feeds the hook's `TParameters` generic so a Data App
 * author gets compile-time errors on missing required keys, wrong value
 * types, and unknown slugs. Falls back to `Record<string, unknown>` if
 * `TAction` is not a schema entry (e.g. a bare numeric id).
 *
 * @category useAction
 * @notExported ActionParamValue
 */
export type ActionParametersFromDataAppSchema<TAction> = TAction extends {
  parameters: readonly ActionParameterSchema[];
}
  ? {
      [P in TAction["parameters"][number] as P extends { required: true }
        ? P["slug"]
        : never]: ActionParamValue<P>;
    } & {
      [P in TAction["parameters"][number] as P extends { required: true }
        ? never
        : P["slug"]]?: ActionParamValue<P>;
    }
  : Record<string, unknown>;

/**
 * Maps a schema entry's `implicitKind` (or `type === "query"`) to the flat
 * `ActionKind` union. Feeds the hook's `TKind` generic so `result` is
 * typed via `ActionResultForKind<TKind>` with no cast — schema-derived,
 * but the value the hook sees is just a string literal.
 *
 *   row/create  → "create"
 *   row/update  → "update"
 *   row/delete  → "delete"
 *   bulk/*      → "bulk"
 *   type=query  → "sql"
 *
 * Falls back to the full `ActionKind` union if `TAction` is not a schema
 * entry (e.g. a bare numeric id).
 *
 * @category useAction
 */
export type ActionKindFromDataAppSchema<TAction> = TAction extends {
  implicitKind: "row/create";
}
  ? "create"
  : TAction extends { implicitKind: "row/update" }
    ? "update"
    : TAction extends { implicitKind: "row/delete" }
      ? "delete"
      : TAction extends { implicitKind: `bulk/${string}` }
        ? "bulk"
        : TAction extends { type: "query" }
          ? "sql"
          : ActionKind;
