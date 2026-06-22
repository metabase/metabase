import { useState } from "react";

import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

// A Metabase action's numeric id (an `entity_id` string also works).
// To get the id, open the action editor and copy it from the URL,
// or fetch it via `GET /api/action`.
const SET_DISCOUNT_ACTION_ID = 42;

// Declare the parameter shape the action expects. Keys are the parameter
// slugs (the names shown in Metabase's action editor), not internal UUIDs.
type SetDiscountParameters = {
  id: number;
  discount: number;
};

function SetDiscountButton({ orderId }: { orderId: number }) {
  const { execute, isExecuting, result, error } =
    useAction<SetDiscountParameters>(SET_DISCOUNT_ACTION_ID);
  const [discount, setDiscount] = useState(0.1);

  const onClick = async () => {
    try {
      await execute({ id: orderId, discount });
    } catch {
      // The thrown error is also captured into `error` state, below.
    }
  };

  return (
    <div>
      <label>
        Discount:&nbsp;
        <input
          type="number"
          step="0.05"
          value={discount}
          onChange={(e) => setDiscount(Number(e.target.value))}
        />
      </label>

      <button onClick={onClick} disabled={isExecuting}>
        {isExecuting ? "Applying…" : "Apply discount"}
      </button>

      {result ? <span>Done.</span> : null}

      {/* [<snippet error-render>] */}
      {error ? (
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {error.data.message ?? "Action failed."}
        </pre>
      ) : null}
      {/* [<endsnippet error-render>] */}
    </div>
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <SetDiscountButton orderId={1} />
    </MetabaseProvider>
  );
}
