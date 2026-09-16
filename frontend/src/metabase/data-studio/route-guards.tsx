import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { canAccessDataModel } from "metabase/current-user";
import {
  MetabaseIsSetup,
  UserIsAuthenticated,
  createRedirectGuard,
} from "metabase/route-guards";
import { Outlet } from "metabase/router";

const UserCanAccessDataStudio = createRedirectGuard(
  (state) => canAccessDataStudio(state),
  "/unauthorized",
);

const UserCanAccessDataModel = createRedirectGuard(
  (state) => canAccessDataModel(state),
  "/unauthorized",
);

export const CanAccessDataStudio = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessDataStudio>
        <Outlet />
      </UserCanAccessDataStudio>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessDataModel = () => (
  <UserCanAccessDataModel>
    <Outlet />
  </UserCanAccessDataModel>
);
