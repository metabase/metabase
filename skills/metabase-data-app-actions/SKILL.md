---
name: metabase-data-app-actions
description: Use when a Metabase data app needs to trigger a write or mutation — submitting a form, updating a row, deleting an entry, running a saved action, or any "do something" interaction. Covers invoking an existing action via `useAction`, parameter typing, response handling, and the critical post-action refresh of any UI data the action may have changed.
---

# Triggering actions from a Metabase data app

A Metabase **action** is a saved, parameterized SQL write against the data warehouse — an `INSERT`, `UPDATE`, or `DELETE`. Actions are configured ahead of time on the Metabase instance, with their parameters and permissions already set. A data app's job is to **invoke** an action with the right parameters when the user does something — clicking a button, submitting a form, confirming a destructive prompt.

## The mental model

- Every action the app can run appears in the schema as `schema.actions.<actionName>`, with `type: "query"`.
- Each action publishes a `parameters` list. Each parameter has a `slug` (the key the Data App sends), a `jsType` (`"string"` / `"number"` / `"Date"` / `"boolean"` / `"unknown"`), and an optional `required` flag.
- Use `action.parameters` to know which fields to render and submit. The result reports `result["rows-affected"]`; use it for lightweight confirmation, then refresh the table/question/query data the page already shows.

## What's in the schema (and what isn't)

Action entries are only generated when the typed schema includes actions. Before writing action-invoking code, make sure the schema was generated with `include-actions=true`; with `database=<name-or-id>&include-actions=true`, Metabase includes the actions for that database only.

Before writing any action-invoking code, enumerate what's available under `schema.actions`. The schema is your **complete** catalog of the actions the app can run. Anything not present doesn't exist as far as the Data App is concerned: when the app needs a write the schema lacks, ask the user to create it as a query action without a model (`POST /api/action` with `type: "query"` and no `model_id`; actions created in the Metabase UI belong to a model and are never listed), on a database with actions enabled, then regenerate the schema.

## The hook

```ts
import { useAction } from "@metabase/embedding-sdk-react/data-app";

const { execute, isExecuting, result, error, reset } = useAction(MyAction);
```

- **Import it from `@metabase/embedding-sdk-react/data-app`.** That entry's `useAction` is the data-app form: it accepts a `defineAction(...)` export or `null` and nothing else. The main entry's `useAction` is the general SDK hook, which also takes plain objects and raw ids, so it cannot enforce the definition at compile time; in a data app, a raw id still fails at runtime with "was passed to `useAction` as a raw id".
- **The argument** is the `defineAction(...)` export itself, declared in the app's root-level `actions/` directory (one `<topic>.action.ts` file per topic, beside `package.json`, never under `src/`) — pass `MyAction`, not `MyAction.copiedActionEntityId`. The hook accepts nothing else in a data app: an inline `{ action: ... }` object, the schema entry, or a spread copy of a definition fails to compile with `Property 'definedWithDefineAction' is missing`. Fix that by adding the export to `actions/`, not with a cast and not by calling `defineAction(...)` at the hook, which compiles but never gets a copy. A production build then runs the copy its `copiedActionEntityId` names in the app's `resources/actions/`, on a copy of its model in the app's own collection; the dev preview keeps running the authored action, so an app works before its resources exist. Writing those copies is covered by the data-app guidance on writing an app's `resources/` (use skill discovery). Do **not** pass `schema.actions.<action>` or its `.id`: the entry is a compile error, and a data app refuses the raw id at runtime with "was passed to `useAction` as a raw id".
- **Don't write the generics.** The definition carries its schema entry, so the hook infers both the parameters object and the discriminated `result` from it: `parameters[]` becomes a keyed object (`required: true` entries are required keys, each value typed from its `jsType`), and `type: "query"` makes the kind `"sql"`. The raw-id form exists only on the SDK's `useAction` from the main entry, where `useAction<TParameters, TKind>(42)` needs them spelled out since an id describes nothing; a data app never names an action by id.
- **`execute(parameters)`** — triggers the action. Parameters object is keyed by parameter `slug`; parameters declared `required: true` are required keys, everything else optional. Returns the response body on success AND throws on failure (the error is also written to `error` state for render-time consumers). Resolves to `null` (without making a request) when `actionId` is `null` or the SDK is not yet initialized — guard the call site if those cases are reachable.
- **No `enabled` / `options` argument.** The hook only ever runs when `execute(...)` is called, so a gate option would be redundant. Skip the action by branching in the event handler:
  ```ts
  const onClick = async () => {
    if (!user.canEdit) return;
    await execute({ id: orderId, discount });
  };
  ```
- **`isExecuting`** — `true` between the call and its resolution. Drive button `disabled` from this so the user can't double-click into duplicate requests.
- **`result`** — the response body, discriminated by `TKind` (or the `AnyActionResult` union when `TKind` is omitted). `null` before the first call and after `reset()`. Use it for lightweight confirmation (`result?.["rows-affected"]`), then refresh surrounding data — see *After an action runs*.
- **`error`** — the last thrown error, typed `ActionExecuteError | null`. Read fields directly with no cast: `error?.data?.message`, `error?.status`, `error?.isCancelled`.
- **`reset()`** — clears `result` and `error` back to `null`. Useful after the user acknowledges success or dismisses an error.

**The hook does NOT auto-fire on mount.** Actions only run when the Data App calls `execute(...)` explicitly.

## Canonical usage — a form that creates a row

```tsx
import { useAction } from "@metabase/embedding-sdk-react/data-app";

import { CreatePerson } from "../../actions/people.action";

function AddPersonForm({ onCreated }: { onCreated: () => void }) {
  const { useState } = React;
  const { execute, isExecuting, error, reset } = useAction(CreatePerson);

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

When `execute(...)` fails, surface both error layers. The hook's `error` is typed `ActionExecuteError | null` — shape `{ status?, data: { message?, errors? }, isCancelled }`. `error.data.message` is the whole-request failure. `error.data.errors` is a per-field validation map keyed by parameter slug (`{ <slug>: <message> }`), or `{}` for whole-request failures — which is every failure of the SQL itself. Read both directly, no cast:

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

- **Object keys in `execute({ … })` match the parameter `slug` strings.** Use them as literal string keys — the shape the hook derives from the definition rejects typos at compile time, but only when the argument is the `defineAction(...)` export (not a bare id).
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

Slugs are whatever the action's author named the SQL parameters in Metabase; the schema is the source of truth.

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
2. Confirm `useAction` was called with the `defineAction(...)` export imported from `actions/`. Passing the schema entry, an inline object, or a spread copy is a compile error; passing its `.id` compiles but leaves `execute` untyped and fails at runtime with "was passed to `useAction` as a raw id". Calling `defineAction(...)` inside the component compiles too, but it has no copy in `resources/`, so a deployed app throws "This action has no copy". The same error means a definition in `actions/` lacks its `copiedActionEntityId`.
3. Log the object passed to `execute({ ... })`. Every key must match a parameter `slug` from `schema.actions.<action>.parameters`; every value must match its declared `jsType`.
4. List every data view on the screen that reads the rows the action writes. Confirm each one's data hook is mounted ABOVE the action trigger so its refresh callback can be passed down.
5. Confirm the refresh callback is called AFTER `await execute(...)` AND that the refresh itself is awaited. When multiple refreshes apply, confirm they're awaited together (`Promise.all`).
6. If the schema doesn't list an action you expect, the action isn't defined on the instance or the schema file is stale. Regenerate the schema.

## Common Mistakes

- Importing `useAction` from `@metabase/embedding-sdk-react` instead of `@metabase/embedding-sdk-react/data-app`. The main entry's hook is the general SDK one and accepts anything, so the definition check never runs.
- Declaring the action anywhere but root-level `actions/`: inline at the hook, wrapped in `defineAction(...)` inside a component, or under `src/actions/`. Only definitions in `actions/` are checked against `resources/`.
- Passing `schema.actions.<action>.id` to `useAction` instead of the `defineAction(...)` export. `execute` then accepts any `Record<string, unknown>`, typos like `{ wrongKey: 1 }` slip through, and a data app refuses the raw id at runtime with "was passed to `useAction` as a raw id".
- Forgetting to refresh after a successful action. The UI keeps rendering stale data with no error or warning.
- Rendering `"Failed"` / `"Something went wrong"` / `String(error)` instead of the real backend message. Always extract `error.data.message` / `error.data.errors` (the diagnostic the user needs is in there) and render it verbatim — see *Showing the error message*.
- Calling the refresh callback without `await`ing it. The modal dismisses or the form clears before fresh data arrives, leaving the user staring at the stale view for a beat.
- Loading data INSIDE the same component that triggers the action. The hook is below the trigger, so its refresh callback can't be wired up. Lift the data hook to a parent and hand its refresh callback down to the trigger.
- Passing raw `<input>` strings as parameter values when the slug's `jsType` is `"number"` or `"boolean"`. Coerce at the call site.
- Letting the trigger fire while a previous request is in flight. Drive `disabled={isExecuting}` from the hook.
- Prepending the action's `result` directly to a local list to skip the refresh. Server-filled defaults (auto-IDs, timestamps, computed columns, derived join columns) diverge from any client-side guess.
- Inventing an action because the user asked for behavior the instance doesn't expose. The schema is the catalog of what exists; surface the gap, don't fake the call.
- Reaching for `fetch("/api/action/...")` directly. The sandbox blocks raw network calls to the Metabase origin (raw `fetch`/XHR work only for external `allowed_hosts` declared in `data_app.yaml`); the only path to actions is `useAction`.
