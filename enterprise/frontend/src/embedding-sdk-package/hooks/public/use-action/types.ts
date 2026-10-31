/**
 * Public types for the `useAction` hook surface.
 *
 * The hook itself is schema-agnostic — the `ActionKind` union and the
 * discriminated `ActionResultForKind` shape it drives describe just the
 * kind / response surface. The `…FromDataAppSchema` helpers below layer on
 * top, deriving the hook's `TParameters` / `TKind` generics from a
 * data app's action definition; the hook never sees the
 * schema directly.
 */

import type { SdkActionId } from "embedding-sdk-bundle/types/action";

import type {
  FieldSchema,
  RowValue,
  SchemaJavaScriptType,
  TableSchema,
} from "../data-schema";

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
// These read a single action definition of a data app
// and derive the hook's `TParameters` / `TKind`. `useAction` applies them to a
// `defineAction(...)` export, so a Data App writes neither generic.
// ============================================================================

/**
 * The implicit actions a data app defines on a table.
 *
 * @category useAction
 */
export type ImplicitActionKind = "row/create" | "row/update" | "row/delete";

/**
 * A data app action that writes a row of a table from the app's schema: the
 * dev preview runs it without saving it, and a production build runs the
 * action `entityId` names.
 *
 * @category useAction
 */
export type ImplicitActionDefinition = {
  entityId: string;
  kind: ImplicitActionKind;
  table: TableSchema;
};

/**
 * What `defineAction` wraps. Its table's fields drive
 * `ActionParametersFromDefinition`, and its `kind` drives
 * `ActionKindFromDefinition`.
 *
 * @category useAction
 */
export type ActionDefinition = ImplicitActionDefinition;

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
 * An implicit action's parameters: its table's columns, by name, each typed
 * by its `jsType` and optional, since the database decides what a row needs.
 *
 * @category useAction
 * @notExported ActionParamValue
 */
export type TableActionParameters<TTable> = TTable extends {
  fields: infer TFields extends Record<string, FieldSchema>;
}
  ? {
      [TKey in keyof TFields as Lowercase<
        TFields[TKey]["name"]
      >]?: ActionParamValue<TFields[TKey]>;
    }
  : Record<string, unknown>;

/**
 * The parameters of an action definition, which type the hook's `execute`.
 * Falls back to `Record<string, unknown>` if `TDefinition` is not a
 * definition (e.g. a bare numeric id).
 *
 * @category useAction
 */
export type ActionParametersFromDefinition<TDefinition> = TDefinition extends {
  table: infer TTable;
}
  ? TableActionParameters<TTable>
  : Record<string, unknown>;

/**
 * Maps an action definition to the flat `ActionKind` union: `row/create`
 * gives `"create"`, and so on. Feeds the hook's
 * `TKind` generic so `result` is typed via `ActionResultForKind<TKind>`.
 *
 * @category useAction
 */
export type ActionKindFromDefinition<TDefinition> = TDefinition extends {
  kind: `row/${infer TKind extends "create" | "update" | "delete"}`;
}
  ? TKind
  : ActionKind;

/**
 * @interface
 * @expand
 * @category useAction
 */
export type UseActionResult<
  TParameters extends Record<string, unknown> = Record<string, unknown>,
  TKind extends ActionKind | undefined = undefined,
> = {
  /**
   * Trigger the action with the given parameters. Returns the response body
   * on success AND throws on failure — the same error is stored in `error`
   * for render-time consumers. Resolves to the discriminated `result` shape
   * (see `ActionResultForKind<TKind>`); when `TKind` is omitted it resolves
   * to `AnyActionResult`, narrowable via `"<key>" in r`.
   *
   * Resolves to `null` (without making a request) when `actionId` is `null`
   * or the SDK is not yet initialized — guard the host-side caller with
   * `if (!actionId) return;` if these cases are reachable.
   */
  execute: (
    parameters: TParameters,
  ) => Promise<ActionResultForKind<TKind> | null>;
  isExecuting: boolean;
  /** Last response, or `null` before first call and after `reset()`. */
  result: ActionResultForKind<TKind> | null;
  /** Last thrown error, normalized to the public `ActionExecuteError` shape, or `null`. */
  error: ActionExecuteError | null;
  /** Clear `result` and `error`. */
  reset: () => void;
};

/**
 * Marks an action as declared through `defineAction`. A data app's `useAction`
 * accepts only marked definitions, so an inline definition object is a
 * compile-time error.
 *
 * @category useAction
 */
export declare class DefinedAction {
  private readonly definedWithDefineAction: true;
}

/** The SDK's `useAction`: a definition object, or an id. */
export interface UseAction {
  /** A definition, which types `execute` and `result` itself. */
  <TDefinition extends ActionDefinition>(
    action: TDefinition | null,
  ): UseActionResult<
    ActionParametersFromDefinition<TDefinition>,
    ActionKindFromDefinition<TDefinition>
  >;

  /** An id, which describes nothing: `useAction<Parameters, "create">(42)`. */
  <
    TParameters extends Record<string, unknown> = Record<string, unknown>,
    TKind extends ActionKind | undefined = undefined,
  >(
    actionId: SdkActionId | null,
  ): UseActionResult<TParameters, TKind>;
}

/**
 * A data app's `useAction`: only a `defineAction(...)` definition.
 */
export interface UseDataAppAction {
  <TDefinition extends DefinedAction & ActionDefinition>(
    action: TDefinition | null,
  ): UseActionResult<
    ActionParametersFromDefinition<TDefinition>,
    ActionKindFromDefinition<TDefinition>
  >;
}
