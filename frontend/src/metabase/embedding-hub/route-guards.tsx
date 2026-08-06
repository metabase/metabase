import { canAccessEmbeddingHub } from "metabase/common/embedding-hub/selectors";
import {
  AvailableInEmbedding,
  MetabaseIsSetup,
  UserIsAuthenticated,
  createRedirectGuard,
} from "metabase/route-guards";
import { Outlet } from "metabase/router";

const UserCanAccessEmbeddingHub = createRedirectGuard(
  (state) => canAccessEmbeddingHub(state),
  "/unauthorized",
);

// Must be in sync with canAccessEmbeddingHub in frontend/src/metabase/common/embedding-hub/selectors.ts
export const CanAccessEmbeddingHub = () => (
  <MetabaseIsSetup>
    <UserIsAuthenticated>
      <UserCanAccessEmbeddingHub>
        <AvailableInEmbedding>
          <Outlet />
        </AvailableInEmbedding>
      </UserCanAccessEmbeddingHub>
    </UserIsAuthenticated>
  </MetabaseIsSetup>
);
