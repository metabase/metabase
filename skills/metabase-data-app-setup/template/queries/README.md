# queries/

Every Metabase query this app runs is declared here: one `defineQuery(...)`
named export per query, in a file named `<topic>.query.ts`. The query hooks
accept nothing else. `useMetabaseQuery` and `useMetabaseQueryObject` take a
`defineQuery` export only, so an inline query object, a `satisfies
MetabaseQueryOptions` object, or a spread copy of a definition fails to compile
with `Property 'definedWithDefineQuery' is missing`.

```ts
// queries/orders.query.ts
import {
  aggregations,
  breakout,
  defineQuery,
} from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

const orders = schema.tables.orders;

export const OrdersList = defineQuery({
  savedQuestionEntityId: "<entity ID of its saved question>",
  source: orders,
  limit: 100,
});

export const OrdersByMonth = defineQuery({
  savedQuestionEntityId: "<entity ID of its saved question>",
  source: orders,
  aggregations: [aggregations.count()],
  breakouts: [breakout(orders.fields.createdAt, { unit: "month" })],
});
```

```tsx
// src/pages/Overview.tsx
import {
  filter,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react/data-app";
import { useState } from "react";
import { OrdersList } from "../../queries/orders.query";

export function Overview() {
  const [status, setStatus] = useState("all");

  // runtime state goes in the second argument, never into the definition
  const { data, isLoading, error } = useMetabaseQuery(OrdersList, {
    filters:
      status === "all"
        ? []
        : [filter(OrdersList.source.fields.status, "=", status)],
  });

  // ...render a status control that calls setStatus, then data
}
```

Rules:

- This directory sits beside `package.json`, not under `src/`. The CLI scans
  only `queries/` and `actions/`, so a definition anywhere else never gets a
  saved question and fails in production.
- Keep a definition static. A clause whose value comes from a control (a
  selected filter, a date range, a search box) goes in the hook's second
  argument, never inside `defineQuery`.
- One export per query the app renders. Filter-option queries, KPI queries, and
  helper queries are queries too.
- Pass the export itself to the hook. Never spread or copy it.
- Each definition carries `savedQuestionEntityId`, the entity ID of its saved
  question in `resources/cards/`. After adding or changing a definition, update
  that card (`npm run print-resources` shows what it must hold). A metric it
  aggregates is copied into `resources/cards/` too, written from what the same
  command prints. Then run `npm run check-resources`, and commit the
  definitions and `resources/` together. `npm run build` fails until they
  match.
- Never copy a `savedQuestionEntityId` to another definition, or remove it while
  its card exists.
