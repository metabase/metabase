import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
  useQuestionQuery,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

const ORDERS_LIST_QUESTION_ID = 1;
const ORDERS_STATS_QUESTION_ID = 2;
const MARK_SHIPPED_ACTION_ID = 42;

type MarkShippedParameters = { id: number };

function OrdersScreen({ orderId }: { orderId: number }) {
  const { refetch: refreshList } = useQuestionQuery(ORDERS_LIST_QUESTION_ID);
  const { refetch: refreshStatTile } = useQuestionQuery(
    ORDERS_STATS_QUESTION_ID,
  );
  const { execute, isExecuting } = useAction<MarkShippedParameters>(
    MARK_SHIPPED_ACTION_ID,
  );

  const onClick = async () => {
    // [<snippet parallel-refresh>]
    await execute({ id: orderId });
    await Promise.all([refreshList(), refreshStatTile()]);
    // [<endsnippet parallel-refresh>]
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
      <OrdersScreen orderId={1} />
    </MetabaseProvider>
  );
}
