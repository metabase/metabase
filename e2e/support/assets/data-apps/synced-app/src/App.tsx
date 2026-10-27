import { useMetabaseQuery } from "@metabase/embedding-sdk-react/data-app";

import { queries } from "./metabase";

/**
 * Runs the saved question that the app's typed schema defines as `ordersCount`.
 */
export default function App() {
  const orders = useMetabaseQuery(queries.ordersCount);
  const rows = orders.data?.rawRows;

  const total = rows?.[0]?.[1];

  return (
    <div data-testid="synced-app-content" style={{ padding: 24 }}>
      <h1>Synced app</h1>

      {orders.error ? (
        <div data-testid="synced-app-error">{String(orders.error)}</div>
      ) : (
        <div data-testid="synced-app-total">
          {total === undefined ? "" : String(total)}
        </div>
      )}
    </div>
  );
}
