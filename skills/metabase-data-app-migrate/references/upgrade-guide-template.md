# Upgrade guide template

Copy this file to `upgrades/v<N>-to-v<N+1>.md` and fill every section. Delete the
guidance in angle brackets. Rules the template encodes:

- Every step is mechanical and idempotent: applying it twice is a no-op, and its
  **Done when** command decides whether it is still needed.
- A **Done when** for a code step inspects the app's own tree (grep, file
  presence), never compiler output: the app cannot compile until the last upgrade.
  A **Done when** for an instance step is an API response.
- The symbol table is complete, types included. Derive it from the diff of
  `resources/embedding-sdk/dist/data-app.d.ts` (and `index.d.ts` for main-entry
  components apps use) between the two releases.
- Every command in the guide must pass unchanged on a fresh copy of the new
  template, and the whole guide must take a fresh copy of the previous template
  to a passing `npm run typecheck && npm run build`.

````markdown
# Data app contract v<N> -> v<N+1>

Metabase release: <x.YY> SDK tag: <YY-alpha | YY-stable> PR: <#>

## Why this is a breaking change

<One paragraph: what an app built for v<N> does on a v<N+1> Metabase without
these edits, e.g. "the bundle refuses to load because `useFoo` no longer exists
on the endowed `/data-app` export".>

## Preconditions

Run from the app directory. Every command must print `ok`.

```bash
grep -q 'export default dataAppConfig()' vite.config.ts && echo ok
grep -q 'DataAppFactory' src/index.tsx && echo ok
<upgrade-specific precondition, if any>
```

If one fails, stop: the app is not template-shaped at v<N>. See SKILL.md, Step 1.

## Removed and renamed symbols

| Symbol     | Entry point                              | Change       | Replacement           |
| ---------- | ---------------------------------------- | ------------ | --------------------- |
| `oldName`  | `@metabase/embedding-sdk-react/data-app` | renamed      | `newName`             |
| `gone`     | `@metabase/embedding-sdk-react/data-app` | removed      | <what to use instead> |
| `OldProps` | `@metabase/embedding-sdk-react/data-app` | type removed | `NewProps`            |

Every row is a `tsc` error at v<N+1>. List types as well as values.

## Other contract changes

<Manifest fields, `queries/` and `actions/` layout, generated-id keys, factory
shape, `providerProps`, sandbox rules, what an app may declare, or "none".>

## Steps

### Step 1 - <imperative title>

Files: `src/**/*.tsx`

Before:

```tsx
import { oldName } from "@metabase/embedding-sdk-react/data-app";
```

After:

```tsx
import { newName } from "@metabase/embedding-sdk-react/data-app";
```

Notes: <edge cases; what NOT to touch>

Done when:

```bash
! grep -rqE '\boldName\b' src queries actions && echo ok
```

### Step 2 - <imperative title>

<same shape>

## Instance steps

<Steps whose effect lives in Metabase rather than in the repo, or "none". Each
ends with a **Done when** that reads the API:>

Done when:

```bash
( source "$ROOT/.env.local"; curl -s -H "x-api-key: $DATA_APP_MB_API_KEY" "$DATA_APP_MB_URL/api/apps/<slug>" ) | grep -q '"sync_error":null' && echo ok
```

## Done-check summary

All of this upgrade's **Done when** commands in one block. Every line must print `ok`.

```bash
( ! grep -rqE '\boldName\b' src queries actions && echo ok )
( <step 2 command> && echo ok )
```

## After this upgrade

<Follow-ups with their exact commands, e.g. "regenerate `src/metabase.data.ts`:
<curl command>", or "nothing". If this is not the final upgrade, nothing is built.>
````
