import { useState } from "react";

import {
  InteractiveQuestion,
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

// IDs of a saved question that lists orders and a "Mark shipped" action.
const ORDERS_QUESTION_ID = 1;
const MARK_SHIPPED_ACTION_ID = 42;

type MarkShippedParameters = {
  id: number;
};

function OrdersScreen() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div>
      <InteractiveQuestion key={refreshKey} questionId={ORDERS_QUESTION_ID} />
      <MarkAllShippedButton onShipped={() => setRefreshKey((key) => key + 1)} />
    </div>
  );
}

function MarkAllShippedButton({ onShipped }: { onShipped: () => void }) {
  const { execute, isExecuting } = useAction<MarkShippedParameters>(
    MARK_SHIPPED_ACTION_ID,
  );

  const onClick = async () => {
    await execute({ id: 1 });
    // Only refresh once the action has succeeded, so the question re-queries
    // against the mutated rows.
    onShipped();
  };

  return (
    <button onClick={onClick} disabled={isExecuting}>
      {isExecuting ? "Shipping…" : "Mark order as shipped"}
    </button>
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <OrdersScreen />
    </MetabaseProvider>
  );
}
