import { canAccessContentStudio } from "metabase/common/content-studio/selectors";
import {
  AvailableInEmbedding,
  MetabaseIsSetup,
  UserIsAuthenticated,
  createRedirectGuard,
} from "metabase/route-guards";
import { Outlet } from "metabase/router";

const UserCanAccessContentStudio = createRedirectGuard(
  (state) => canAccessContentStudio(state),
  "/unauthorized",
);

// Must be in sync with canAccessContentStudio in frontend/src/metabase/common/content-studio/selectors.ts
export const CanAccessContentStudio = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessContentStudio>
        <AvailableInEmbedding>
          <Outlet />
        </AvailableInEmbedding>
      </UserCanAccessContentStudio>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);
