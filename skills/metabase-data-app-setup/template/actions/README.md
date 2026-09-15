# actions/

Every Metabase action this app triggers is declared here: one
`defineAction(...)` named export per action, in a file named
`<topic>.action.ts`. The data-app `useAction`, imported from
`@metabase/embedding-sdk-react/data-app`, takes a `defineAction` export only, so
an inline `{ action: ... }` object, an id, the schema entry itself, or a spread
copy of a definition fails to compile. The main entry's `useAction` is the SDK's
own hook and skips this check; do not import it in a data app.

```ts
// actions/orders.action.ts
import { defineAction } from "@metabase/embedding-sdk-react/data-app";
import schema from "../src/metabase.data";

export const CreateOrder = defineAction({
  action: schema.models.orders.actions.create,
});
```

```tsx
// src/components/CreateOrderForm.tsx
import { useAction } from "@metabase/embedding-sdk-react/data-app";
import { CreateOrder } from "../../actions/orders.action";

const { execute, isExecuting, error } = useAction(CreateOrder);

// keys and value types come from the action's parameters
await execute({ status: "paid" });
```

Rules:

- This directory sits beside `package.json`, not under `src/`. Synchronization
  (`npm run sync-resources`, run by `npm run build`) scans only `queries/` and
  `actions/`, so a definition anywhere else is never synchronized, and the
  authored action is refused for the app's viewers in production.
- Actions exist only when the generated schema includes models
  (`include-models=true`). Synchronization copies actions; it never creates
  them.
- Pass the export itself to `useAction`. Never pass
  `schema.models.<model>.actions.<action>` or its `.id`.
- `copiedActionId` is written by synchronization. Never add, edit, or remove it
  by hand; commit it together with `resources_metadata.json`.
- After `execute` resolves, refresh every query on screen the action could have
  changed.
