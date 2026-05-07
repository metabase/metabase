---
name: typescript-convert-js
description: Convert JavaScript files to TypeScript in the frontend code. Use when migrating .js/.jsx files to .ts/.tsx.
---

# TypeScript Migration Skill

## When to Use

Use this skill when asked to convert one or more `.js` or `.jsx` files to `.ts` or `.tsx` in the Metabase frontend (`frontend/src/` or `enterprise/frontend/src/`).

## Quick Reference

### Commands

- **Type check:** `bun run type-check-pure` (runs project-wide; filter output with `grep "your/file.ts"`)
- **Lint (with autofix):** `node_modules/.bin/eslint --fix --max-warnings 0 <file>`
- **Lint (pure, no fix):** `bun run lint-eslint-pure`
- **Run a specific Jest test:** `node_modules/.bin/jest "<spec-file-name>" --no-coverage`

### Key Type Locations

| What you need                                                                                        | Where to look                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| API entity types (`Card`, `Dashboard`, `DashboardCard`, `ClickBehavior`, `VisualizationSettings`, …) | `frontend/src/metabase-types/api/`                                                    |
| Redux `State`, `Dispatch`, `GetState`                                                                | `frontend/src/metabase-types/store/state.ts`                                          |
| Store slice types (`EntitiesState`, `RequestsState`, …)                                              | `frontend/src/metabase-types/store/`                                                  |
| Global `Window` interface extensions                                                                 | `frontend/src/types/global.d.ts`                                                      |
| RTK Query `Api` instance                                                                             | `frontend/src/metabase/api/api.ts`                                                    |
| Redux typed dispatch hook                                                                            | `frontend/src/metabase/lib/redux/hooks.ts` (`DispatchFn`)                             |
| Redux store type (`EnhancedStore<State>`)                                                            | `@reduxjs/toolkit` + `State` from metabase-types                                      |
| Settings singleton                                                                                   | `frontend/src/metabase/lib/settings.ts` (default export: `MetabaseSettings` instance) |
| Dayjs plugin type                                                                                    | `dayjs` → `PluginFunc`                                                                |
| Entity type (createEntity return)                                                                    | `frontend/src/metabase/lib/entities.ts` → `Entity`                                    |
| Request action creators                                                                              | `frontend/src/metabase/redux/requests.d.ts`                                           |

## Type Discipline

**Avoid `any`, `unknown`, `object`, and type assertions (`as X`) as much as possible.** When you encounter a type challenge:

1. Look for the existing type in `metabase-types/` first.
2. If no type exists, define one locally with proper shape.
3. Prefer type annotations, generics, discriminated unions, type guards, or `satisfies` over assertions.
4. Use `as X` only at explicit interop boundaries where TypeScript cannot express verified runtime behavior. Keep the assertion as narrow and local as possible, and add a short comment explaining the evidence.
5. Avoid `as unknown as X`. Use it only when bridging an untyped legacy API and no narrower assertion or declaration file can model the boundary; document why it's necessary with a comment.
6. Use `any` only when a function is a deliberate bridge between typed and untyped worlds (HOF decorators, dynamic dispatch) — always add an `eslint-disable` comment explaining the reason.

**Specific patterns to avoid:**

```ts
// Bad — loses type information
const doSomething = (date: unknown) => { ... }

// Good — look up or define the proper type
const doSomething = (date: Date) => { ... }

// Bad — unnecessary erasure
const state: object = getState();

// Good — use the actual state type
const state: State = getState();

// Bad — hides a missing type or validation problem
const card = response as Card;

// Good — type the API/client boundary or validate before narrowing
const card: Card = await fetchCard(id);
```

## Research Phase (Do This First)

Before converting any file:

1. **Read the file fully.** Understand all imports, exports, and runtime patterns (dynamic `require`, `EventEmitter`, class inheritance, HOFs).
2. **Identify the extension.** Use `.ts` unless the file contains JSX, in which case use `.tsx`.
3. **Find existing types.** Search `metabase-types/api/` and `metabase-types/store/` for types matching the shapes used. Avoid redeclaring types that already exist.
4. **Check for Window globals.** If the file reads from `window.SomeProperty`, check `frontend/src/types/global.d.ts`. If the property isn't declared there, add it.
5. **Note `require()` and `EventEmitter` usage.** These need special handling (see below).
6. **Run `bun run type-check-pure` before you start** to get a baseline error count. Run it again after each significant change to verify you're reducing errors, not adding them.

## Conversion Workflow

### 1. Rename the file

```bash
git mv frontend/src/metabase/some/file.js frontend/src/metabase/some/file.ts
```

Use `.tsx` for files with JSX.

### 2. Add types

- Add types to function parameters, return types, and exported interfaces.
- **Do not use `any`, `unknown`, or `object` as parameter types.** Use specific types or define new ones.
- For inherently dynamic patterns (HOF decorators, `compose` chains), first try typed helpers, generics, or declaration files. If an assertion is still required, keep it at the outer boundary with a comment explaining why the runtime shape is safe.
- Prefer `import type { Foo }` over `import { Foo }` for type-only imports.
- Merge multiple `import type` statements from the same module into one.

### 3. Run the type checker

```bash
bun run type-check-pure 2>&1 | grep "your/file.ts"
```

Filter to only your file's errors. Fix all real errors. Skip errors caused by missing `node_modules` (see Infrastructure Caveats below).

### 4. Run the linter

```bash
node_modules/.bin/eslint --fix --max-warnings 0 frontend/src/metabase/some/file.ts
```

Fix all warnings before finishing the conversion.

### 5. Delete the old JS file

If you created the TS file as a new file rather than using `git mv`, delete the original:

```bash
git rm frontend/src/metabase/some/file.js
```

## Common Lint Rules to Watch For

### `@typescript-eslint/consistent-type-imports`

All type imports must use `import type`. Inline `import()` type annotations are forbidden.

```ts
// Bad
function foo(x: import("metabase-types/api").Card) {}

// Good
import type { Card } from "metabase-types/api";
function foo(x: Card) {}
```

In `.d.ts` declaration files, you cannot use `import type` at the top level inside a global `interface` block. Instead, inline the shape directly:

```ts
// Bad (in global.d.ts)
interface Window {
  MyGlobal?: import("some-lib").SomeType;
}

// Good (in global.d.ts)
interface Window {
  MyGlobal?: {
    someField: string;
    otherField?: number;
  };
}
```

### `@typescript-eslint/no-require-imports`

Dynamic `require()` calls are forbidden unless disabled inline. Use `eslint-disable-next-line` on the line before:

```ts
// Dynamic locale loading — can't use static import
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(`dayjs/locale/${locale}.js`);

// Circular dependency workaround
// eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic require to avoid circular dependency
require("metabase/entities/containers").addEntityContainers(entity);
```

### `import/no-default-export`

The codebase discourages default exports. If the original JS used `export default`, convert to named export and update the use in other files. If many files are using the default export (5+), keep it but add the comment:

```ts
// eslint-disable-next-line import/no-default-export -- deprecated usage
export default myThing;
```

## Infrastructure Caveats

These type errors appear in the worktree (no `node_modules`) but **do not exist in CI** with a proper install. Run `bun install` first, then these largely disappear:

| Error                                                        | Cause                         |
| ------------------------------------------------------------ | ----------------------------- |
| `Cannot find module 'events'` / `emit` not on class          | Missing `@types/node`         |
| `Cannot find module 'dayjs'` / `'ttag'` / `'icepick'` / etc. | No `node_modules` in worktree |
| `Cannot find name 'describe'` / `'jest'` / `'expect'`        | Missing `@types/jest`         |
| `Cannot find module 'react/jsx-runtime'`                     | Missing React types           |

## Typing Patterns for Common Metabase Patterns

### Redux store parameter

```ts
import type { EnhancedStore, UnknownAction } from "@reduxjs/toolkit";
import type { State } from "metabase-types/store";

function initializeEmbedding(store: EnhancedStore<State>): void { ... }

// Prefer a declaration file or typed wrapper for legacy actions that predate RTK.
// If that is not practical, keep the assertion at the dispatch boundary and document it.
store.dispatch(push(location) as unknown as UnknownAction);
```

### Dispatch / GetState in thunks

For legacy thunk patterns, a broad dispatch type is needed to accept any action shape:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDispatch = (action: any) => any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGetState = () => any;
```

### Higher-order thunk decorators (`withAction`, `withRequestState`, etc.)

Use generic `TArgs extends unknown[]`. `compose()` from `@reduxjs/toolkit` loses type inference through multiple levels. Prefer typed decorator helpers; if that is not practical, recover the type once at the outer boundary:

```ts
/** compose loses types across multiple decorator levels; this boundary assertion recovers the verified runtime shape. */
function makeAction(composed: unknown): EntityActionCreator {
  return composed as EntityActionCreator;
}

const myAction = makeAction(compose(
  withAction(ACTION_TYPE),
  withRequestState(...),
)((args) => async (dispatch, getState) => { ... }));
```

### Untyped JS files that are imported (e.g., `requests.js`)

When a `.js` file exports functions that are called from a `.ts` file, TypeScript may infer them as 0-argument (because `createAction` without types is 0-arg). Fix by adding a sibling `.d.ts` declaration file:

```ts
// frontend/src/metabase/redux/requests.d.ts
export declare function setRequestLoading(
  statePath: (string | number)[],
  queryKey?: string,
): {
  type: string;
  payload: { statePath: (string | number)[]; queryKey?: string };
};
```

### `EntitySelectors` and the State type mismatch

Entity selectors accept any state shape because they're called with both partial test states and the full typed `State`. Use a broad state parameter:

```ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SelectorState = any;

export type EntitySelectors = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: (state: SelectorState, ...args: any[]) => unknown;
  getObject: (
    state: SelectorState,
    props: { entityId?: EntityId },
  ) => EntityObject | undefined;
  // ...
};
```

### `VirtualCard.dataset_query` type mismatch

`VirtualCard.dataset_query` is typed as `Record<string, never>` (an empty object). Prefer fixing the source type if the converted file owns it. If not, isolate the assertion at the API boundary:

```ts
import type { DatasetQuery } from "metabase-types/api";

Question.create({
  dataset_query: datasetQuery as DatasetQuery,
});
```

### Extending the Window interface

Add new `window.*` properties in `frontend/src/types/global.d.ts`. Inline the shape — don't use `import()` type annotations:

```ts
interface Window {
  MyNewGlobal?: {
    headers: { language: string };
    translations: Record<string, unknown>;
  };
}
```

### Module namespace mutation (e.g., monkey-patching `ttag`)

When you need to mutate a module's exported properties at runtime (e.g., debug i18n replacement), import as a namespace and isolate the assertion to the mutable alias:

```ts
import * as ttag from "ttag";

const mutableTtag = ttag as typeof ttag & Record<string, unknown>;
mutableTtag.t = (...args: Parameters<typeof ttag.t>): string => { ... };
```

## Spec File Pitfalls

### Circular destructuring defaults

TypeScript raises `TS7022` when destructured parameter defaults reference sibling parameters:

```ts
// Bad — TypeScript sees `statePath` as circularly referenced
const getArgs = ({
  statePath = ["test", "path"],
  statePathFetch = statePath.concat("fetch"), // ← TS7022
} = {}) => { ... };

// Good — use a plain object parameter, compute derived values in the body
const getArgs = (overrides: { statePath?: string[]; statePathFetch?: string[] } = {}) => {
  const statePath = overrides.statePath ?? ["test", "path"];
  const statePathFetch = overrides.statePathFetch ?? statePath.concat("fetch");
  return { statePath, statePathFetch };
};
```

### Dynamic entity objects in tests

When using `createEntity()` in tests, the dynamic nature of the returned object makes full static typing impractical:

```ts
// Type the variable broadly in test context; the runtime behavior is verified by the tests
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyEntity = any;

const widgets: AnyEntity = createEntity({ name: "widgets", ... });
// Now widgets.selectors.getObject, widgets.actions.fetch, etc. are accessible
```

## Checklist Before Finishing

1. File renamed to `.ts` or `.tsx` (no leftover `.js` file)
2. All function parameters and return types annotated — no bare `unknown`, `any`, or `object` on public interfaces
3. All `import type` statements merged per module (no duplicate module imports)
4. No inline `import()` type annotations — use `import type` at the top
5. All `require()` calls have `eslint-disable-next-line @typescript-eslint/no-require-imports`
6. If the JS file being converted had no `.d.ts` companion and is imported from TS files, verify the inferred types are correct (e.g. action creators from `redux-actions` may appear as 0-arg without proper types)
7. Assertions are avoided unless they are explicit, documented interop boundaries
8. Type check passes with no new errors: `bun run type-check-pure 2>&1 | grep "your/file.ts"` shows no errors
9. Lint passes: `node_modules/.bin/eslint --max-warnings 0 frontend/src/...`
10. Existing tests still pass (or failures are only due to missing CLJS build artifacts — run `bun run build:cljs` if needed)
