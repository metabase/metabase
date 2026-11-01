import { MetabaseTestProvider } from "../components/MetabaseTestProvider";

<MetabaseTestProvider
  // @ts-expect-error `StaticQuestion` has no `dashboardId` prop
  StaticQuestion={({ dashboardId }) => <p>{dashboardId}</p>}
/>;

<MetabaseTestProvider
  CreateDashboardModal={({ onCreate }) => (
    // @ts-expect-error `onCreate` takes the created dashboard
    <button onClick={() => onCreate("Q3 revenue")}>Create</button>
  )}
/>;

// @ts-expect-error `loginStatus` takes a login status object
<MetabaseTestProvider loginStatus="success" />;
