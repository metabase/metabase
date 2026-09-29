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
  action: schema.actions.createOrder,
});
```

```tsx
// src/components/CreateOrderForm.tsx
import { useAction } from "@metabase/embedding-sdk-react/data-app";
import type { FormEvent } from "react";
import { CreateOrder } from "../../actions/orders.action";

export function CreateOrderForm({ onCreated }: { onCreated: () => void }) {
  const { execute, isExecuting, error } = useAction(CreateOrder);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      // keys and value types come from the action's parameters
      await execute({ status: "paid" });
      onCreated();
    } catch {
      // the failure is also in `error`, rendered below
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <button type="submit" disabled={isExecuting}>
        Create order
      </button>
      {error && <p>{error.data.message}</p>}
    </form>
  );
}
```

Rules:

- This directory sits beside `package.json`, not under `src/`.
- Actions exist only when the generated schema includes actions
  (`include-actions=true`).
- Pass the export itself to `useAction`. Never pass
  `schema.actions.<action>` or its `.id`.
- After `execute` resolves, refresh every query on screen the action could have
  changed.
