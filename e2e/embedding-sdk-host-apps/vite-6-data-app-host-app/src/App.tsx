import { StaticQuestion } from "@metabase/embedding-sdk-react";
import { useMetabaseQueryObject } from "@metabase/embedding-sdk-react/data-app";

const ORDERS_TABLE_ID = 5;

export default function App() {
  const { query } = useMetabaseQueryObject({
    source: { type: "table", id: ORDERS_TABLE_ID },
  });

  return (
    <div data-testid="dev-app-content" style={{ padding: 24 }}>
      <h1 style={{ margin: "0 0 16px" }}>Vite 6 data app</h1>

      <div data-testid="dev-app-question" style={{ height: 400 }}>
        {query ? (
          <StaticQuestion card={{ query }} />
        ) : (
          <div data-testid="dev-app-loading">…</div>
        )}
      </div>
    </div>
  );
}
