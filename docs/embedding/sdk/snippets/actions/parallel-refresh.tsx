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

const ORDERS_LIST_QUESTION_ID = 1;
const ORDERS_STATS_QUESTION_ID = 2;
const MARK_SHIPPED_ACTION_ID = 42;

type MarkShippedParameters = { id: number };

function OrdersScreen({ orderId }: { orderId: number }) {
  const [refreshKey, setRefreshKey] = useState(0);

  const { execute, isExecuting } = useAction<MarkShippedParameters>(
    MARK_SHIPPED_ACTION_ID,
  );

  const onClick = async () => {
    // [<snippet parallel-refresh>]
    await execute({ id: orderId });
    // One state bump remounts every dependent view, refreshing them together.
    setRefreshKey((key) => key + 1);
    // [<endsnippet parallel-refresh>]
  };

  return (
    <div>
      <InteractiveQuestion
        key={`list-${refreshKey}`}
        questionId={ORDERS_LIST_QUESTION_ID}
      />
      <InteractiveQuestion
        key={`stats-${refreshKey}`}
        questionId={ORDERS_STATS_QUESTION_ID}
      />
      <button onClick={onClick} disabled={isExecuting}>
        {isExecuting ? "Shipping…" : "Mark order as shipped"}
      </button>
    </div>
  );
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <OrdersScreen orderId={1} />
    </MetabaseProvider>
  );
}
