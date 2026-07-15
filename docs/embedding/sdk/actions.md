---
title: "Modular embedding SDK - actions"
summary: Trigger Metabase actions from your embedded application with the `useAction` hook.
---

# Modular embedding SDK - actions

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

With the `useAction` hook, you can trigger an [action](../../actions/introduction.md) when someone clicks a button or submits a form in your app.

The hook handles the HTTP request, exposes loading and error state as React state, and types the parameters the action expects. Basic CRUD and custom SQL actions are supported; HTTP-type actions are not. Always trigger actions through `useAction` — calling `POST /api/action/:id/execute` directly with `fetch` may be blocked in sandboxed embedding contexts.

## Triggering an action with `useAction`

```ts
const { execute, isExecuting, result, error, reset } = useAction<
  TParameters,
  TKind   // optional — drives the typed `result` shape
>(actionId);
```

- `actionId` — the action's numeric id, its `entity_id` string, or `null`. Find the numeric id in Metabase by opening the action editor and copying it from the URL.
- `TParameters` — a TypeScript type describing the parameters object that will be passed to `execute`. Keys are the action's parameter slugs (the names shown in the action editor).
- `TKind` (optional) — the action's kind literal. Pass one of `"create"`, `"update"`, `"delete"`, `"bulk"`, or `"sql"` to get a typed `result` for that single shape. If you omit `TKind`, `result` defaults to a union of every possible response body (`AnyActionResult`), which you can narrow with `"<key>" in result`. See [Typing the response](#typing-the-response).
- `execute(parameters)` — call `execute` from an event handler to trigger the action. The hook doesn't auto-fire on mount. Resolves to the response body on success, throws on failure, or resolves to `null` if `actionId` is `null`, or the SDK isn't yet initialized. You can `await execute(parameters)` or fire and forget. The same error is written to `error` state either way, so a render-time error message will appear even without a `try`/`catch`.
- `isExecuting` — `true` between the call and its resolution. Use `isExecuting` to disable the trigger and prevent double-clicks.
- `result` — the response body, or `null` before the first call and after `reset()`.
- `error` — the last thrown error, or `null`. See [Error handling](#error-handling).
- `reset()` — clears `result` and `error`.

#### API Reference

- [Hook](./api/useAction.html)
- [Return type](./api/UseActionResult.html)

## Example button to trigger an action

This button calls a custom SQL action to apply a discount to an order:

```typescript
{% include_file "{{ dirname }}/snippets/actions/basic.tsx" %}
```

## Parameter keys

**Send parameters keyed by `slug`**. The parameter's display `name` (e.g. `"Discount"`) won't work; you must use the slug (e.g., `"discount"`).

### Parameter value types

You can pass strings, number, and boolean parameters. For dates, pass an ISO 8601 string. Examples:

```typescript
{% include_file "{{ dirname }}/snippets/actions/parameter-values.tsx" snippet="primitives-and-dates" %}
```

#### Dates and timezones

When the target column is `TIMESTAMP` without timezone, send the ISO value either _without a timezone offset_, or with the `Z` suffix:

```typescript
{% include_file "{{ dirname }}/snippets/actions/date-picker.tsx" snippet="timestamp-utc" %}
```

A timezone-offset value like `"2024-01-15T10:00:00+05:00"` is typically converted to UTC by the database driver, so the stored wall-clock shifts (the example above would store `05:00:00`). Exact behavior varies by warehouse — check your driver if precise timezone handling matters. For `TIMESTAMP WITH TIME ZONE` columns the offset is preserved as the same instant; for `DATE` columns timezone is irrelevant.

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
| `"sql"`            | Custom SQL action                                | `{ "rows-affected": number }`                                                                     |

#### API Reference

- [ActionKind](./api/ActionKind.html)
- [AnyActionResult](./api/AnyActionResult.html)
- [ActionResultForKind](./api/ActionResultForKind.html)
- [ActionResultForCreate](./api/ActionResultForCreate.html)
- [ActionResultForUpdate](./api/ActionResultForUpdate.html)
- [ActionResultForDelete](./api/ActionResultForDelete.html)
- [ActionResultForBulk](./api/ActionResultForBulk.html)
- [ActionResultForSql](./api/ActionResultForSql.html)

Example with a known kind:

```typescript
{% include_file "{{ dirname }}/snippets/actions/typed-response.tsx" snippet="known-kind" %}
```

### Reading the result

It's common not to read the result at all (see [After an action succeeds, you must refresh the data](#after-an-action-succeeds-you-must-refresh-the-data)).

But if you do read the result, specify `TKind` if you know the action's result up front.

If you don't supply `TKind`, the `result` defaults to `AnyActionResult`, which is the union of every possible response body. TypeScript knows the result is one of the five known shapes, just not which one. You can then narrow with the `in` operator:

```typescript
{% include_file "{{ dirname }}/snippets/actions/typed-response.tsx" snippet="narrow-result" %}
```

The union default catches mistyped reads: if the type system can't prove `result` has a key, it'll error.

## After an action succeeds, you must refresh the data

When an action succeeds, you'll need to refresh any data in the UI that the action could have changed, otherwise the data on screen may be stale. There is no automatic refresh.

After `execute` resolves successfully, refresh a question by remounting it: keep a `refreshKey` in state, use it as the question's `key`, and bump it after the action. The new `key` gives the question a fresh mount, which re-runs its query.

```typescript
{% include_file "{{ dirname }}/snippets/actions/with-refresh.tsx" %}
```

If a single action invalidates more than one view, drive every dependent question off the same `refreshKey` so one state bump remounts them all and they re-query together:

```typescript
{% include_file "{{ dirname }}/snippets/actions/parallel-refresh.tsx" snippet="parallel-refresh" %}
```

Don't try to drive the state from `result` directly. The response body is for confirmation (a row count, the inserted row's primary key, etc.). You can use the `result` for toasts or detail-view navigation, but you still need to re-read the source to update the data on screen.

## Error handling

The hook normalizes whatever the underlying network client throws into a clean, public-facing shape and types `error` accordingly:

{% include_file "{{ dirname }}/api/snippets/ActionExecuteError.md" snippet="properties" %}

`error.status` is **optional**: present for HTTP-level failures (4xx / 5xx), absent for transport-layer failures (offline, aborted) where no HTTP response was received. The actionable diagnostic for end users lives at `error.data.message`.

`error.data.errors` is a per-field map (`{ <slug>: <message> }`) when the backend reports parameter-level validation failures, keyed by the same parameter slugs you pass to `execute`. For whole-request failures (like a foreign-key constraint), it's an empty `{}` and the message lives in `error.data.message`.

#### API Reference

- [ActionExecuteError](./api/ActionExecuteError.html)

For SQL or driver errors, `error.data.message` often includes a newline and the failing SQL statement on the next line, so render the error message inside an element with `white-space: pre-wrap` (a `<pre>` is fine). A `<span>` collapses the newlines into one wall of text.

The basic example above renders `error.data.message` with a static fallback when no message was provided:

```typescript
{% include_file "{{ dirname }}/snippets/actions/basic.tsx" snippet="error-render" %}
```

Display the error message verbatim. Don't replace the message with a generic "Something went wrong". The raw SQL / validation / permission error is what tells the person how to fix their input.

## Related

- [Actions documentation](../../actions/introduction.md)
