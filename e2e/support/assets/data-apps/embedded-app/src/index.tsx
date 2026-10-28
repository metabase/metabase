import type { DataAppFactory } from "@metabase/embedding-sdk-react/data-app";
import {
  DataAppLink,
  DataAppRouter,
  defineQuery,
  useDataAppLocation,
  useMetabaseQuery,
} from "@metabase/embedding-sdk-react/data-app";
import { useState } from "react";

import { getTestEnv } from "../../kitchen-sink/src/test-env";

function Orders() {
  const { pathname } = useDataAppLocation();
  const orders = useMetabaseQuery(defineQuery(getTestEnv().scalarQuery));
  const [notes, setNotes] = useState("");
  const total = orders.data?.rawRows?.[0]?.[0];

  return (
    <main>
      <h1>Embedded orders</h1>
      <nav>
        <DataAppLink to="/orders">Orders</DataAppLink>
        <DataAppLink to="/orders/details?tab=summary">
          Order details
        </DataAppLink>
      </nav>

      <p data-testid="current-pathname">{pathname}</p>
      <output aria-label="Order count">
        {total === undefined ? "Loading orders" : String(total)}
      </output>
      {orders.error && <p role="alert">Could not load orders</p>}

      <label>
        Notes
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => orders.refetch()}>
        Refresh orders
      </button>
    </main>
  );
}

function App() {
  return (
    <DataAppRouter>
      <Orders />
    </DataAppRouter>
  );
}

const factory: DataAppFactory = () => ({ component: App });

export default factory;
