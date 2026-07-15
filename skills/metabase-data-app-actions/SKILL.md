---
name: metabase-data-app-actions
description: Use when a Metabase data app needs to trigger a write or mutation — submitting a form, updating a row, deleting an entry, running a saved action, or any "do something" interaction. Covers invoking an existing action via `useAction`, parameter typing, response handling, and the critical post-action refresh of any UI data the action may have changed.
---

# Triggering actions from a Metabase data app

A Metabase **action** is a server-defined write operation against the data warehouse — either a basic CRUD operation (insert / update / delete) on a model, or a custom SQL command. Actions are configured ahead of time on the Metabase instance, with their parameters, model bindings, and permissions already set. A data app's job is to **invoke** an action with the right parameters when the user does something — clicking a button, submitting a form, confirming a destructive prompt.

## The mental model

Actions belong to a model. They mutate that model's rows. Concretely:

- Every action has a parent model. In the schema it appears as `schema.models.<modelName>.actions.<actionName>`.
- Model entries are included here only to catalog actions. Do not render models as questions, pass model ids to `InteractiveQuestion`, or fetch model rows; use semantic-layer queries/questions for read views.
- An action's `type` is either `"implicit"` (CRUD on the model) or `"query"` (custom SQL the user authored).
- Implicit actions have an `implicitKind` that says what they do: `"row/create"`, `"row/update"`, `"row/delete"`, or `"bulk/*"` variants.
- Each action publishes a `parameters` list. Each parameter has a `slug` (the key the Data App sends), a `jsType` (`"string"` / `"number"` / `"Date"` / `"boolean"` / `"unknown"`), and an optional `required` flag.
- Use `action.parameters` to know which fields to render and submit. A create result may include `result["created-row"]`, but that row is only typed as `Record<string, RowValue>`; use it for lightweight confirmation, then refresh the existing table/question/query data already used by the page. Do not fetch or render the parent model itself.

## What's in the schema (and what isn't)

Action entries are only generated when the typed schema includes models. Before writing action-invoking code, make sure the schema was generated with `include-models=true`; with `database=<name-or-id>&include-models=true`, Metabase includes models/actions for that database only. Do not rely on `question-collections` for actions; question collections only add saved questions.

Before writing any action-invoking code, look at the schema and enumerate what's available under `schema.models.<m>.actions` across the models the app cares about. The schema is your **complete** catalog of actions for the instance, not a catalog of model data to display. If a model's `actions` entry has `create`, `update`, `delete`, those are the actions invokable. Anything not present doesn't exist as far as the Data App is concerned.

## The hook

```ts
import { useAction } from "@metabase/embedding-sdk-react";
import {
  type ActionKindFromDataAppSchema,
  type ActionParametersFromDataAppSchema,
} from "@metabase/embedding-sdk-react/data-app";

const { execute, isExecuting, result, error, reset } = useAction<
  ActionParametersFromDataAppSchema<typeof schema.models.<model>.actions.<action>>,
  ActionKindFromDataAppSchema<typeof schema.models.<model>.actions.<action>>
>(schema.models.<model>.actions.<action>.id);
```

- **First argument** is the action's numeric **id** — read it off the schema entry as `schema.models.<model>.actions.<action>.id`. The hook also accepts an action's `entity_id` string, but in a Data App you always have the numeric id on hand from the schema, so pass that.
- **`TParameters` generic** — the type of the parameters object you'll pass to `execute`. In a Data App, derive it from the schema with `ActionParametersFromDataAppSchema<typeof schema.models.<model>.actions.<action>>` imported from `@metabase/embedding-sdk-react/data-app`; the helper expands the schema's `parameters[]` into a keyed object, marks `required: true` entries as required keys, and types each value from its `jsType`. Skip the generic and `execute` accepts any `Record<string, unknown>`.
- **`TKind` generic** — the action kind literal that drives the discriminated `result` shape. In a Data App, derive it from the same schema entry with `ActionKindFromDataAppSchema<typeof schema.models.<model>.actions.<action>>` imported from `@metabase/embedding-sdk-react/data-app`; the helper maps `implicitKind` (`"row/create"` → `"create"`, `"row/update"` → `"update"`, `"row/delete"` → `"delete"`, any `"bulk/*"` → `"bulk"`) and `type === "query"` → `"sql"`. Skip the generic and `result` defaults to the `AnyActionResult` union — TS-narrowable via `"<key>" in result`, but you lose the per-kind precision.
- **`execute(parameters)`** — triggers the action. Parameters object is keyed by parameter `slug`; parameters declared `required: true` are required keys, everything else optional. Returns the response body on success AND throws on failure (the error is also written to `error` state for render-time consumers). Resolves to `null` (without making a request) when `actionId` is `null` or the SDK is not yet initialized — guard the call site if those cases are reachable.
- **No `enabled` / `options` argument.** The hook only ever runs when `execute(...)` is called, so a gate option would be redundant. Skip the action by branching in the event handler:
  ```ts
  const onClick = async () => {
    if (!user.canEdit) return;
    await execute({ id: orderId, discount });
  };
  ```
- **`isExecuting`** — `true` between the call and its resolution. Drive button `disabled` from this so the user can't double-click into duplicate requests.
- **`result`** — the response body, discriminated by `TKind` (or the `AnyActionResult` union when `TKind` is omitted). `null` before the first call and after `reset()`. Use it for lightweight confirmation (`result?.["created-row"]` after an insert, `result?.["rows-affected"]` after a SQL action), but do not treat create rows as richly typed model rows; refresh surrounding data instead — see *After an action runs*.
- **`error`** — the last thrown error, typed `ActionExecuteError | null`. Read fields directly with no cast: `error?.data?.message`, `error?.status`, `error?.isCancelled`.
- **`reset()`** — clears `result` and `error` back to `null`. Useful after the user acknowledges success or dismisses an error.

**The hook does NOT auto-fire on mount.** Actions only run when the Data App calls `execute(...)` explicitly.

## Canonical usage — a form that creates a row

```tsx
import { useAction } from "@metabase/embedding-sdk-react";
import {
  type ActionKindFromDataAppSchema,
  type ActionParametersFromDataAppSchema,
} from "@metabase/embedding-sdk-react/data-app";

import schema from "../metabase.data";

function AddPersonForm({ onCreated }: { onCreated: () => void }) {
  const { useState } = React;
  const { execute, isExecuting, error, reset } = useAction<
    ActionParametersFromDataAppSchema<typeof schema.models.people.actions.create>,
    ActionKindFromDataAppSchema<typeof schema.models.people.actions.create>
  >(schema.models.people.actions.create.id);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await execute({ name, email });   // typed: keys match parameter slugs
      setName("");
      setEmail("");
      onCreated();                      // ← let the parent refresh dependent data
    } catch {
      // error is captured into hook state for render-time display
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={isExecuting || !name || !email}>
        {isExecuting ? "Saving…" : "Add"}
      </button>
    </form>
  );
}
```

## Showing the error message

When `execute(...)` fails, surface both error layers. The hook's `error` is typed `ActionExecuteError | null` — shape `{ status?, data: { message?, errors? }, isCancelled }`. `error.data.message` is the whole-request failure. `error.data.errors` is a per-field validation map keyed by parameter slug (`{ <slug>: <message> }`), or `{}` for whole-request failures. Read both directly, no cast:

```tsx
const fieldErrors = error?.data.errors ?? {};

{error ? (
  <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
    {error.data.message ?? "Action failed."}
  </pre>
) : null}

{action.parameters.map((parameter) => {
  const fieldError = fieldErrors[parameter.slug];
  return (
    <label key={parameter.slug}>
      {parameter.displayName}
      <input
        aria-invalid={Boolean(fieldError)}
        style={{ borderColor: fieldError ? "#dc2626" : undefined }}
      />
      {fieldError ? <div role="alert">{fieldError}</div> : null}
    </label>
  );
})}
```

Use `<pre>` (or any element with `white-space: pre-wrap`) — the messages contain newlines that matter (driver errors include the SQL on its own line). A `<span>` collapses them into one wall of text.

Example: submitting a 9-character value into a `CHARACTER(2)` column produces

```
Value too long for column "STATE CHARACTER(2)": "'dadasdasd' (9)";
SQL statement:
UPDATE "PUBLIC"."PEOPLE" SET … WHERE "PUBLIC"."PEOPLE"."ID" = 1 [22001-214]
```

That whole string is `error.data.message`. Render it as-is.

**Don't:**

- Render `"Failed"` / `"Something went wrong"` / `String(error)` instead of `error.data.message` — the user loses the only fix-it info they have.
- Render only `error.data.message` for validation failures — `error.data.errors[parameter.slug]` is often the actionable "which field and why" detail.
- Paraphrase the message into a "friendlier" version. The raw H2/Postgres/SQL error is more actionable than any rewrite.

## After an action runs — keeping the UI honest

When an action succeeds, the data the user sees may be stale. Without an explicit refresh, the list still shows the old rows; the stat tile still shows the old count; the row the user just edited still shows its old values. The action worked, but the UI lies — and there is no warning.

The rule is simple and absolute: **after an action resolves successfully, every piece of data on the screen that the action could have changed must be refreshed.**

## Mapping parameters

Each `parameters[]` entry on a schema action exposes `slug`, `displayName`, `jsType`, and optionally `required`. The Data App's job:

- **Object keys in `execute({ … })` match the parameter `slug` strings.** Use them as literal string keys — the typed `ActionParametersFromDataAppSchema<TAction>` shape will reject typos at compile time, but only when the action arg is the schema entry (not a bare id).
- **Pick the right input `type` from `jsType`** so the browser provides the correct UX and built-in coercion. The agent never invents the input type from the slug name (a slug called `"phone"` is still `jsType: "string"` → `type="text"`).

  | `jsType` | Input element |
  | --- | --- |
  | `"string"` | `<input type="text" …>` |
  | `"number"` | `<input type="number" …>` |
  | `"boolean"` | `<input type="checkbox" …>` (or a Mantine `Switch`/`Checkbox`) |
  | `"Date"` | `<input type="date" …>` (or `"datetime-local"` if a time component is expected) |
  | `"unknown"` | `<input type="text" …>` — best effort, coerce at the call site |

- **Value types in `execute({ … })` match `jsType`.** A `jsType: "number"` parameter wants a `number`, not a string. With `type="number"` the input emits a number for `.valueAsNumber`, but `<input>.value` is still a string — coerce at the call site (`Number(input)`) if you're reading the latter.
- **`required: true` parameters cannot be omitted.** Reflected in the TS type: required keys are required.
- **`displayName`** is for labels; never use it as a key.

For implicit actions, the slugs match the model's column names (slugified). For custom SQL actions, slugs are whatever the action's author named the SQL parameters in Metabase. Either way, the schema is the source of truth.

## Form-side validation — match the main app

The schema exposes `parameter.required` (and `jsType` for type coercion). That's the full validation contract today, matching Metabase's built-in action-execute form. **No length checks, no min/max, no format checks** — anything more granular comes back as a BE error after submit (see *Showing the error message*).

**Schema is the ONLY source of truth.** Read `parameter.required` and wire it — nothing else. Don't add `required` because a field is named `"email"`, don't cap a "name" at 100 chars on a hunch, don't set `type="email"` from the slug. If the schema is silent, the field is unconstrained.

**Disable the submit button while the form is invalid.** Drive it from the browser's native verdict so `required` is the only rule in play:

```tsx
const [isFormValid, setIsFormValid] = useState(false);
const onFormChange = (e: React.FormEvent<HTMLFormElement>) =>
  setIsFormValid(e.currentTarget.checkValidity());

<form onSubmit={...} onChange={onFormChange}>
  <input required={parameter.required} />
  <button type="submit" disabled={isExecuting || !isFormValid}>Create</button>
</form>
```

No hand-rolled `!name || !email` checks.

## Debugging Checklist

When an action appears to succeed but the screen doesn't update, or a call fails with a 400:

1. Log `result`, `error`, and `isExecuting` after `await execute(...)` to confirm the request actually went through and succeeded.
2. Confirm `useAction` was called with `schema.models.<model>.actions.<action>.id` (the numeric id) AND the `ActionParametersFromDataAppSchema<typeof …>` generic — without the generic, `execute` won't type-check the parameters object and typos slip through.
3. Log the object passed to `execute({ ... })`. Every key must match a parameter `slug` from `schema.models.<model>.actions.<action>.parameters`; every value must match its declared `jsType`.
4. List every data view on the screen that reads from the mutated model. Confirm each one's data hook is mounted ABOVE the action trigger so its refresh callback can be passed down.
5. Confirm the refresh callback is called AFTER `await execute(...)` AND that the refresh itself is awaited. When multiple refreshes apply, confirm they're awaited together (`Promise.all`).
6. For implicit actions, confirm the right `implicitKind` matches what you intend (`row/create` vs `row/update` vs `row/delete`) — picking the wrong action publishes the wrong write.
7. If the schema doesn't list an action you expect, the action isn't defined on the instance or the schema file is stale. Regenerate the schema.

## Common Mistakes

- Omitting the `ActionParametersFromDataAppSchema<typeof schema.models.<model>.actions.<action>>` generic on `useAction`. `execute` then accepts any `Record<string, unknown>` and typos like `{ wrongKey: 1 }` slip through.
- Forgetting to refresh after a successful action. The UI keeps rendering stale data with no error or warning.
- Rendering `"Failed"` / `"Something went wrong"` / `String(error)` instead of the real backend message. Always extract `error.data.message` / `error.data.errors` (the diagnostic the user needs is in there) and render it verbatim — see *Showing the error message*.
- Calling the refresh callback without `await`ing it. The modal dismisses or the form clears before fresh data arrives, leaving the user staring at the stale view for a beat.
- Loading data INSIDE the same component that triggers the action. The hook is below the trigger, so its refresh callback can't be wired up. Lift the data hook to a parent and hand its refresh callback down to the trigger.
- Passing raw `<input>` strings as parameter values when the slug's `jsType` is `"number"` or `"boolean"`. Coerce at the call site.
- Letting the trigger fire while a previous request is in flight. Drive `disabled={isExecuting}` from the hook.
- Prepending the action's `result` directly to a local list to skip the refresh. Server-filled defaults (auto-IDs, timestamps, computed columns, derived join columns) diverge from any client-side guess.
- Inventing an action because the user asked for behavior the instance doesn't expose. The schema is the catalog of what exists; surface the gap, don't fake the call.
- Reaching for `fetch("/api/action/...")` directly. The sandbox blocks raw network calls to the Metabase origin (raw `fetch`/XHR work only for external `allowed_hosts` declared in `data_app.yml`); the only path to actions is `useAction`.
