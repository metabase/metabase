import { StaticDashboard } from "@metabase/embedding-sdk-react";
import { useState } from "react";

// The MetabaseProvider on this page needs `isGuest: true` in its authConfig.
const INITIAL_SIGNED_TOKEN = "YOUR_SIGNED_TOKEN";

const Example = () => {
  // [<snippet example>]
  // Render the first token yourself, for example from your server-rendered page props.
  const [token, setToken] = useState(INITIAL_SIGNED_TOKEN);

  async function onRegionChange(region: string) {
    // Your endpoint checks that this user may see `region`,
    // then signs a token with params: { region: [region] }
    const response = await fetch(`/api/metabase-token?region=${region}`);
    const { jwt } = await response.json();
    setToken(jwt);
  }

  return (
    <>
      <select onChange={(event) => onRegionChange(event.target.value)}>
        <option value="us-east">US East</option>
        <option value="us-west">US West</option>
      </select>

      <StaticDashboard token={token} />
    </>
  );
  // [<endsnippet example>]
};

export { Example };
