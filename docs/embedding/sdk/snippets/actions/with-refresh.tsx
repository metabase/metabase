import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
  useQuestionQuery,
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
  // Load the question above the action trigger so its `refetch` callback
  // can be passed down. Lifting the data hook up is what makes
  // "refresh after action" possible.
  const { data, refetch } = useQuestionQuery(ORDERS_QUESTION_ID);

  return (
    <div>
      <OrdersList rows={data?.rows ?? []} />
      <MarkAllShippedButton onShipped={refetch} />
    </div>
  );
}

function OrdersList({ rows }: { rows: unknown[][] }) {
  return (
    <ul>
      {rows.map((row, i) => (
        <li key={i}>{JSON.stringify(row)}</li>
      ))}
    </ul>
  );
}

function MarkAllShippedButton({ onShipped }: { onShipped: () => void }) {
  const { execute, isExecuting } =
    useAction<MarkShippedParameters>(MARK_SHIPPED_ACTION_ID);

  const onClick = async () => {
    await execute({ id: 1 });
    // After the action succeeds, refresh every data view that depends on
    // the mutated rows. `await` the refresh so callers know when the UI
    // reflects the new state.
    await onShipped();
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
