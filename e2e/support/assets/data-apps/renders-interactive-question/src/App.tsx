import { InteractiveQuestion } from "@metabase/embedding-sdk-react";
import {
  useMetabaseQuery,
  useMetabaseQueryObject,
} from "@metabase/embedding-sdk-react/data-app";

const ordersTable = { tableId: 5, databaseId: 1 };

export default function App() {
  const ordersCount = useMetabaseQuery({
    ...ordersTable,
    aggregations: [{ type: "count" }],
  });
  const totalOrders = ordersCount.data?.rawRows?.[0]?.[0];
  const ordersQuery = useMetabaseQueryObject(ordersTable);

  return (
    <div
      data-testid="data-app-content"
      style={{ padding: 24, fontFamily: "sans-serif" }}
    >
      <h1 style={{ margin: "0 0 16px" }}>Orders overview</h1>

      <section
        style={{
          padding: 16,
          border: "1px solid #e0e0e0",
          borderRadius: 8,
          marginBottom: 24,
          maxWidth: 240,
        }}
      >
        <div
          style={{
            color: "#6b7280",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Total orders
        </div>
        <div
          data-testid="orders-count"
          style={{ fontSize: 32, fontWeight: 700 }}
        >
          {ordersCount.isLoading ? "…" : String(totalOrders ?? "—")}
        </div>
      </section>

      <h2 style={{ margin: "0 0 8px" }}>All orders</h2>
      <div style={{ height: 400 }}>
        <InteractiveQuestion card={{ query: ordersQuery }} />
      </div>
    </div>
  );
}
