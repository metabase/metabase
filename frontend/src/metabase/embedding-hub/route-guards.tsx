import { canAccessEmbeddingHub } from "metabase/common/embedding-hub/selectors";
import {
  MetabaseIsSetup,
  UserIsAuthenticated,
  createRedirectGuard,
} from "metabase/route-guards";
import { Outlet } from "metabase/router";

const UserCanAccessEmbeddingHub = createRedirectGuard(
  (state) => canAccessEmbeddingHub(state),
  "/unauthorized",
);

export const CanAccessEmbeddingHub = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessEmbeddingHub>
        <Outlet />
      </UserCanAccessEmbeddingHub>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);
