import {
  MetabaseProvider,
  defineMetabaseAuthConfig,
  useAction,
} from "@metabase/embedding-sdk-react";

const authConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: "https://your-metabase.example.com",
});

// [<snippet known-kind>]
const SET_DISCOUNT_ACTION_ID = 42;

type SetDiscountParameters = { id: number; discount: number };

function SetDiscountButton({ orderId }: { orderId: number }) {
  const { execute, result } = useAction<SetDiscountParameters, "sql">(
    SET_DISCOUNT_ACTION_ID,
  );

  const onClick = async () => {
    await execute({ id: orderId, discount: 0.1 });
  };

  // result is typed `{ "rows-affected": number } | null` — no cast.
  const affected = result?.["rows-affected"];

  return (
    <button onClick={onClick}>
      Apply 10% discount{affected != null ? ` (${affected} rows)` : ""}
    </button>
  );
}
// [<endsnippet known-kind>]

function SetDiscountButtonWithoutKind({ orderId }: { orderId: number }) {
  // [<snippet narrow-result>]
  const { execute, result } = useAction<SetDiscountParameters>(
    SET_DISCOUNT_ACTION_ID,
  );

  const onClick = async () => {
    await execute({ id: orderId, discount: 0.1 });
  };

  let summary = "Apply discount";
  if (result && "rows-affected" in result) {
    // `result["rows-affected"]` is typed `number` here
    summary = `${result["rows-affected"]} rows affected`;
  } else if (result && "created-row" in result) {
    // `result["created-row"]` is typed `Record<string, RowValue>` here
    summary = "Row created";
  }
  // [<endsnippet narrow-result>]

  return <button onClick={onClick}>{summary}</button>;
}

export default function App() {
  return (
    <MetabaseProvider authConfig={authConfig}>
      <SetDiscountButton orderId={1} />
      <SetDiscountButtonWithoutKind orderId={1} />
    </MetabaseProvider>
  );
}
