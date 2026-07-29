import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import {
  AvailableInEmbedding,
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
  (state) => PLUGIN_FEATURE_LEVEL_PERMISSIONS.canAccessDataModel(state),
  "/unauthorized",
);

// Must be in sync with canAccessDataStudio in frontend/src/metabase/data-studio/selectors.ts
export const CanAccessDataStudio = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessDataStudio>
        <AvailableInEmbedding>
          <Outlet />
        </AvailableInEmbedding>
      </UserCanAccessDataStudio>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);

export const CanAccessDataModel = () => (
  <UserCanAccessDataModel>
    <Outlet />
  </UserCanAccessDataModel>
);
