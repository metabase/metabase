import { Outlet } from "metabase/router";

import DeprecationNotice from "../../containers/DeprecationNotice";

const AdminApp = (): JSX.Element => {
  return (
    <>
      <DeprecationNotice />
      <Outlet />
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminApp;
