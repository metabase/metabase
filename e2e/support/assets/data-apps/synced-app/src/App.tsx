import { useMetabaseQuery } from "@metabase/embedding-sdk-react/data-app";

import { OrdersCount } from "../queries/orders.query";

/**
 * Consumes a source-controlled query rather than an inline one, so a production
 * build runs whatever `sync-resources` wrote into the declaration. The spec that
 * drives this app writes `queries/orders.query.ts` before synchronizing.
 */
export default function App() {
  const orders = useMetabaseQuery(OrdersCount);
  const rows = orders.data?.rawRows;

  const total = rows?.[0]?.[1];
  const visibleTenants = rows?.map(([userId]) => userId).join(",");

  return (
    <div data-testid="synced-app-content" style={{ padding: 24 }}>
      <h1>Synced app</h1>

      {orders.error ? (
        <div data-testid="synced-app-error">{String(orders.error)}</div>
      ) : (
        <>
          <div data-testid="synced-app-total">
            {total === undefined ? "" : String(total)}
          </div>

          <div data-testid="synced-app-visible-user-ids">
            {visibleTenants ?? ""}
          </div>
        </>
      )}
    </div>
  );
}
