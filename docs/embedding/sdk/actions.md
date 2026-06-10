---
title: "Modular embedding SDK - actions"
summary: Trigger pre-existing Metabase actions (basic CRUD or custom SQL) from your embedded application with the `useAction` hook.
---

# Modular embedding SDK - actions

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

A Metabase [action](../../actions/introduction.md) is a server-defined write operation against the data warehouse — a basic CRUD operation on a model (insert / update / delete a row) or a custom SQL command. Actions are configured in Metabase ahead of time. Your embedded app's job is to trigger them when a user does something, like clicking a button or submitting a form.

The `useAction` hook is the SDK's path for invoking those pre-existing actions. It handles the HTTP request, exposes loading and error state as React state, and types the parameters the action expects.

## Triggering an action with `useAction`

```ts
const { execute, isExecuting, result, error, reset } = useAction<
  TParameters,
  TKind   // optional — drives the typed `result` shape
>(actionId);
```

- `actionId` — the action's numeric id, its `entity_id` string, or `null`. Find the numeric id in Metabase by opening the action editor and copying it from the URL.
- `TParameters` — a TypeScript type describing the parameters object that will be passed to `execute`. Keys are the action's parameter slugs (the names shown in the action editor).
- `TKind` (optional) — the action's kind literal. Pass one of `"create"`, `"update"`, `"delete"`, `"bulk"`, or `"query"` to get a typed `result` for that single shape. Omit it and `result` defaults to a union of every possible response body (`AnyActionResult`), narrowable with `"<key>" in result`. See [Typing the response](#typing-the-response).
- `execute(parameters)` — call this from an event handler to trigger the action. Resolves to the response body on success, throws on failure, or resolves to `null` if `actionId` is `null` or the SDK is not yet initialized. The same error is also written to `error` state so render-time consumers can read it.
- `isExecuting` — `true` between the call and its resolution. Use it to disable the trigger and prevent double-clicks.
- `result` — the response body, or `null` before the first call and after `reset()`.
- `error` — the last thrown error, or `null`. See [Error handling](#error-handling).
- `reset()` — clears `result` and `error`.

#### API Reference

- [Hook](./api/useAction.html)
- [Return type](./api/UseActionResult.html)

## Example

A button that calls a custom SQL action to apply a discount to an order:

```typescript
{% include_file "{{ dirname }}/snippets/actions/basic.tsx" %}
```

## Parameter keys

Every Metabase action publishes a `parameters` list. Each parameter has two identifiers you can use as a key:

| Field   | Example                                  | Notes                                                                     |
| ------- | ---------------------------------------- | ------------------------------------------------------------------------- |
| `id`    | `"d800e41d-edde-49cb-b63b-2386aba34334"` | Internal UUID for custom SQL actions. For basic CRUD actions, the id is the slug-form. |
| `slug`  | `"discount"`                             | Stable, human-readable. What the Metabase action editor surfaces.          |

**Send parameters keyed by `slug`** — that is the public contract. The backend execute endpoint accepts keys by `slug` or internal `id` and resolves them to the destination parameter, so both work; slug is what shows up in the action editor and what your code should use. The parameter's display `name` (e.g. `"Discount"`) is UI-only and is not accepted as a request key.

### Parameter value types

For string, number, and boolean parameters, just pass the natural TypeScript value. For dates, pass an ISO 8601 string. Examples:

```typescript
{% include_file "{{ dirname }}/snippets/actions/parameter-values.tsx" snippet="primitives-and-dates" %}
```

#### Dates and timezones

When the target column is `TIMESTAMP` without timezone (the common Metabase case — values stored as UTC by convention), send the ISO value **without a timezone offset**, or with the `Z` suffix:

```typescript
{% include_file "{{ dirname }}/snippets/actions/date-picker.tsx" snippet="timestamp-utc" %}
```

A timezone-offset value like `"2024-01-15T10:00:00+05:00"` is silently converted to UTC by the database driver, so the stored wall-clock shifts (the example above would store `05:00:00`). For `TIMESTAMP WITH TIME ZONE` columns the offset is preserved as the same instant; for `DATE` columns timezone is irrelevant.

When the value comes from a browser-local date picker (which often returns the user's local TZ), normalize before sending:

```typescript
{% include_file "{{ dirname }}/snippets/actions/date-picker.tsx" snippet="normalize-date" %}
```

If the string can't be parsed, the database driver throws and the message surfaces via `error.data.message` (see [Error handling](#error-handling)).

## Typing the response

The action's **kind** drives the shape of `result`. Pass it as the second generic to `useAction` and `result` gets typed automatically:

{% include_file "{{ dirname }}/api/snippets/ActionKind.md" %}

| Action kind        | What it covers                                   | `result` shape                                                                                    |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `"create"`         | Single-row insert (basic action)                 | `{ "created-row": Record<string, RowValue> }`                                                     |
| `"update"`         | Single-row update                                | `{ "rows-updated": readonly RowValue[] }`                                                         |
| `"delete"`         | Single-row delete                                | `{ "rows-deleted": readonly RowValue[] }`                                                         |
| `"bulk"`           | Any bulk variant (bulk create / update / delete) | `{ success: boolean; "rows-created"?: number; "rows-updated"?: number; "rows-deleted"?: number }` |
| `"query"`          | Custom SQL action                                | `{ "rows-affected": number }`                                                                     |

#### API Reference

- [ActionKind](./api/ActionKind.html)
- [AnyActionResult](./api/AnyActionResult.html)
- [ActionResultForKind](./api/ActionResultForKind.html)
- [ActionResultForCreate](./api/ActionResultForCreate.html)
- [ActionResultForUpdate](./api/ActionResultForUpdate.html)
- [ActionResultForDelete](./api/ActionResultForDelete.html)
- [ActionResultForBulk](./api/ActionResultForBulk.html)
- [ActionResultForQuery](./api/ActionResultForQuery.html)

Example with a known kind:

```typescript
{% include_file "{{ dirname }}/snippets/actions/typed-response.tsx" snippet="known-kind" %}
```

### Omitting `TKind`

If you don't supply `TKind`, `result` defaults to `AnyActionResult` — the union of every possible response body. This is more accurate than the loose `Record<string, unknown>` you might expect: TypeScript knows the result is one of the five known shapes, just not which one. Narrow with the `in` operator:

```typescript
{% include_file "{{ dirname }}/snippets/actions/typed-response.tsx" snippet="narrow-result" %}
```

The union default catches mistyped reads — `result?.["rows-affected"]` errors directly if the type system can't prove `result` has that key. Specifying `TKind` is the clean way out when you know the action's kind upfront.

If you don't read `result` at all (the common case — see [Refreshing data after an action](#refreshing-data-after-an-action)), neither variant matters.

## Refreshing data after an action

When an action succeeds, the data on the screen is likely stale. A list still shows the old rows; a stat tile still shows the old count; the row the user just edited still shows its old values. The action worked, but the UI lies — and there is no automatic refresh.

**The rule:** after `execute` resolves successfully, refresh every piece of data on the screen that the action could have changed. Load the data hook above the action trigger so its `refetch` callback can be passed down:

```typescript
{% include_file "{{ dirname }}/snippets/actions/with-refresh.tsx" %}
```

If a single action invalidates more than one view, kick off the refreshes in parallel and `await` them together so the user sees a single coherent flip from stale to fresh:

```typescript
{% include_file "{{ dirname }}/snippets/actions/parallel-refresh.tsx" snippet="parallel-refresh" %}
```

Don't try to drive list state from `result` directly. The response body is for confirmation (a row count, the inserted row's primary key, etc.) — use it for toasts or detail-view navigation, not as a substitute for re-reading the source.

## Error handling

The hook normalizes whatever the underlying network client throws into a clean, public-facing shape and types `error` accordingly — no casting required to read its fields:

{% include_file "{{ dirname }}/api/snippets/ActionExecuteError.md" snippet="properties" %}

`error.status` is **optional**: present for HTTP-level failures (4xx / 5xx), absent for transport-layer failures (offline, aborted) where no HTTP response was received. The actionable diagnostic for end users lives at `error.data.message`.

#### API Reference

- [ActionExecuteError](./api/ActionExecuteError.html)

For SQL or driver errors, `error.data.message` often includes a newline and the failing SQL statement on the next line, so render it inside an element with `white-space: pre-wrap` (a `<pre>` is fine) — a `<span>` collapses the newlines into one wall of text.

The basic example above renders `error.data.message` with a static fallback when no message was provided:

```typescript
{% include_file "{{ dirname }}/snippets/actions/basic.tsx" snippet="error-render" %}
```

Surface the message verbatim. Don't replace it with a generic "Something went wrong" — the raw SQL / validation / permission error is what tells the user how to fix their input.

## Notes on `useAction`

- **The hook does not auto-fire.** `execute` is only called by your code, in response to a user event.
- **Disable the trigger while a request is in flight.** Drive `disabled={isExecuting}` on your button or form-submit to prevent duplicate submissions.
- **`execute` can be `await`-ed or fired-and-forgotten.** Both work — the same error is captured into `error` state either way, so a render-time error message will appear even if you don't `try` / `catch` at the call site.
- **HTTP-type actions are not supported.** The backend rejects them. Use basic CRUD or custom SQL actions.
- **`useAction` is the only supported path.** Don't try to call `POST /api/action/:id/execute` directly with `fetch`; in sandboxed embedding contexts, raw network calls may be blocked.

## Related

- [Actions documentation](../../actions/introduction.md)
