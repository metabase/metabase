---
name: metabase-data-app-actions
description: Use when a Metabase data app needs to trigger a write or mutation — submitting a form, updating a row, deleting an entry, running a saved action, or any "do something" interaction. Covers invoking an existing action via `useAction`, parameter typing, response handling, and the critical post-action refresh of any UI data the action may have changed.
---

# Triggering actions from a Metabase data app

A Metabase **action** is a saved, parameterized SQL write against the data warehouse — an `INSERT`, `UPDATE`, or `DELETE` — with its parameters and permissions set on the instance. A data app **invokes** an action with the right parameters when the user does something: clicks a button, submits a form, confirms a destructive prompt.

## The catalog

- Every action the app can run is `schema.actions.<actionName>` in the generated schema, which lists actions only when it was generated with `include-actions=true` (see the semantic-layer skill).
- Each action has a `parameters` list. A parameter has a `slug` (the key the app sends), a `displayName`, a `jsType` (`"string"` / `"number"` / `"Date"` / `"boolean"` / `"unknown"`), and an optional `required` flag.
- The schema is the **complete** catalog. When the app needs a write the schema lacks, stop and ask the user to create it as a query action that belongs to no model (`POST /api/action` with `type: "query"` and no `model_id`; actions created in the Metabase UI belong to a model and are never listed), on a database with actions enabled. Then regenerate the schema. Never fake the call.

## Declare it, then call it

```ts
// actions/orders.action.ts — root-level, beside package.json, never under src/
import { defineAction } from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

export const AddTeam = defineAction({ action: schema.actions.addTeam });
```

```ts
import { useAction } from "@metabase/embedding-sdk-react/data-app";
import { AddTeam } from "../../actions/orders.action";

const { execute, isExecuting, result, error, reset } = useAction(AddTeam);
```

- **Import `useAction` from `@metabase/embedding-sdk-react/data-app`.** It accepts only a `defineAction(...)` export (or `null`); the main entry's hook accepts anything and skips that check.
- **Pass the export from `actions/`.** An inline object, the schema entry, a spread copy or a number does not compile (`Property 'definedWithDefineAction' is missing`). A `defineAction(...)` written anywhere but `actions/` compiles but is never synchronized, and production refuses to run it ("This action has not been synchronized"). Fix it by moving the export into `actions/`, never with a cast.
- `npm run build` copies the action into the app's collection and writes `copiedActionId` into the definition; a production build runs that copy, the dev preview the authored action. Never edit `copiedActionId` by hand.
- **No generics.** The definition types `execute`'s parameters (`required` slugs are required keys, values typed from `jsType`) and `result`.
- **`execute(parameters)`** runs the action. It returns the response body and throws on failure (the error also lands in `error`). It never runs on mount and has no `enabled` option — branch in the event handler instead.
- **`isExecuting`** is `true` while a call is in flight: show a spinner in the trigger and set `disabled={isExecuting}`.
- **`result`** is `{ "rows-affected": number }`, or `null` before the first call and after `reset()`. An `UPDATE` or `DELETE` whose `WHERE` matched nothing resolves with `0`: when the user expects a row to change, treat `0` as a failure and say so.
- **`error`** is `ActionExecuteError | null`: `{ status?, data: { message? }, isCancelled }`. **`reset()`** clears `result` and `error`.

## A form that writes a row

```tsx
import { type FormEvent, useState } from "react";
import { useAction } from "@metabase/embedding-sdk-react/data-app";

import { AddTeam } from "../../actions/orders.action";

export function AddTeamForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const { execute, isExecuting, error } = useAction(AddTeam);
  const [teamName, setTeamName] = useState("");
  const [score, setScore] = useState(0);
  const [isValid, setIsValid] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await execute({ team_name: teamName, score });
      setTeamName("");
      await onAdded(); // refresh every view the write could change
    } catch {
      // rendered from `error` below
    }
  }

  return (
    <form onSubmit={onSubmit} onChange={(event) => setIsValid(event.currentTarget.checkValidity())}>
      <input required value={teamName} onChange={(event) => setTeamName(event.target.value)} />
      <input required type="number" value={score} onChange={(event) => setScore(event.target.valueAsNumber)} />
      <button type="submit" disabled={isExecuting || !isValid}>{isExecuting ? "Saving…" : "Add"}</button>
      {error ? <pre style={{ whiteSpace: "pre-wrap" }}>{error.data.message ?? "Action failed."}</pre> : null}
    </form>
  );
}
```

## Parameters and validation

- Keys in `execute({ … })` are the parameter `slug`s, exactly as the schema emits them; `displayName` is only a label.
- Values follow `jsType`: a `number` parameter takes a number, not the input's string `value` (`valueAsNumber` or `Number(...)`). Pick the input from `jsType` — `text`, `number`, a checkbox for `boolean`, a date input for `Date` — never from the slug's name.
- `parameter.required` is the whole client-side contract: set `required` on the input and disable submit from the form's native `checkValidity()`. Add no length, range or format rules of your own; the database reports anything else when the action runs.

## Showing a failure

Render `error.data.message` verbatim in a `<pre>` (or any `white-space: pre-wrap` element): it is the database's own error, usually with the SQL on its own line, and it is the only fix-it information the user gets. Never replace it with "Failed", `String(error)`, or a friendlier paraphrase.

## After a write — refresh what it changed

A successful action leaves every view of the rows it wrote stale, with no warning. After `execute` resolves, refresh each table, question or query on screen that reads those rows, and `await` the refresh (`Promise.all` for several) before clearing the form or closing the modal. The action entry does not name its table: read it from the action's SQL or ask. Keep the data hooks above the trigger so their refresh callbacks can be passed down, and never patch a local list from `result` — the database fills ids, defaults and computed columns.

## Debugging

1. Log `result`, `error` and `isExecuting` after `await execute(...)`.
2. Log the object passed to `execute`: every key a `slug` from `schema.actions.<action>.parameters`, every value its `jsType`.
3. `rows-affected` is `0`: the `WHERE` matched nothing — check the key value.
4. A `403` in production: the viewer cannot read the app's collection, or the action's database blocks them; neither is fixed in the app's code.
5. The schema lacks an expected action: it has a model, sits in a data app's collection, or the schema is stale — regenerate it, then see *The catalog*.
