import { StaticDashboard } from "@metabase/embedding-sdk-react";
import { useState } from "react";

// The MetabaseProvider on this page needs `isGuest: true` in its authConfig.
const INITIAL_SIGNED_TOKEN = "YOUR_SIGNED_TOKEN";

const Example = () => {
  // [<snippet example>]
  // Render the first token yourself, for example from your server-rendered page props.
  const [token, setToken] = useState(INITIAL_SIGNED_TOKEN);

  async function onCustomerChange(customerId: string) {
    // Your endpoint checks that this viewer may see `customerId`,
    // then signs a token with params: { customer_id: [customerId] }
    const response = await fetch(
      `/api/metabase-token?customer_id=${encodeURIComponent(customerId)}`,
    );
    const { jwt } = await response.json();
    setToken(jwt);
  }

  return (
    <>
      <select onChange={(event) => onCustomerChange(event.target.value)}>
        <option value="13">Customer 13</option>
        <option value="14">Customer 14</option>
        <option value="15">Customer 15</option>
      </select>

      {/* `key` remounts the dashboard when the token changes, so it re-queries with the new locked value. */}
      <StaticDashboard key={token} token={token} />
    </>
  );
  // [<endsnippet example>]
};

export { Example };
