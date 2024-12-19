import { useKBar } from "kbar";
import { useEffect } from "react";
import { Route, type WithRouterProps, withRouter } from "react-router";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupRecentViewsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  mockScrollIntoView,
  mockScrollTo,
  renderWithProviders,
} from "__support__/ui";
import { getAdminPaths } from "metabase/admin/app/reducers";
import { useCommandPaletteBasicActions } from "metabase/palette/hooks/useCommandPaletteBasicActions";
import type { RecentItem, Settings } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
  createMockRecentCollectionItem,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  createMockAdminAppState,
  createMockAdminState,
  createMockState,
} from "metabase-types/store/mocks";

import { PaletteResults } from "../../PaletteResults";

const TestComponent = withRouter(
  ({ q, ...props }: WithRouterProps & { q?: string; isLoggedIn: boolean }) => {
    useCommandPaletteBasicActions(props);

    const { query } = useKBar();

    useEffect(() => {
      if (q) {
        query.setSearch(q);
      }
    }, [q, query]);

    return <PaletteResults />;
  },
);

const DATABASE = createMockDatabase();

const collection_1 = createMockCollection({
  name: "lame collection",
  id: 3,
});

//Verified, but no collection details present
const model_1 = createMockCollectionItem({
  model: "dataset",
  name: "Foo Question",
  moderated_status: "verified",
  id: 1,
});

const model_2 = createMockCollectionItem({
  model: "dataset",
  name: "Bar Question",
  collection: collection_1,
  id: 2,
});

const dashboard = createMockCollectionItem({
  model: "dashboard",
  name: "Bar Dashboard",
  collection: collection_1,
  description: "Such Bar. Much Wow.",
});

const recents_1 = createMockRecentCollectionItem({
  ..._.pick(model_1, "id", "name"),
  model: "dataset",
  moderated_status: "verified",
  parent_collection: {
    id: "root",
    name: "Our analytics",
  },
});
const recents_2 = createMockRecentCollectionItem({
  ..._.pick(dashboard, "id", "name"),
  model: "dashboard",
  parent_collection: {
    id: dashboard.collection?.id as number,
    name: dashboard.collection?.name as string,
  },
});

mockScrollTo();
mockScrollIntoView();

const TOKEN_FEATURES = createMockTokenFeatures({ content_verification: true });

export interface CommonSetupProps {
  query?: string;
  settings?: Partial<Settings>;
  recents?: RecentItem[];
  isEE?: boolean;
  isAdmin?: boolean;
}

export const commonSetup = ({
  query,
  settings = {},
  recents = [recents_1, recents_2],
  isEE,
  isAdmin = false,
}: CommonSetupProps = {}) => {
  setupDatabasesEndpoints([DATABASE]);
  setupSearchEndpoints([model_1, model_2, dashboard]);
  setupRecentViewsEndpoints(recents);
  const adminState = isAdmin
    ? createMockAdminState({
        app: createMockAdminAppState({
          paths: getAdminPaths(),
        }),
      })
    : createMockAdminState();

  const storeInitialState = createMockState({
    admin: adminState,
    settings: mockSettings({ ...settings, "token-features": TOKEN_FEATURES }),
    currentUser: createMockUser({
      is_superuser: isAdmin,
    }),
  });

  if (isEE) {
    setupEnterprisePlugins();
  }

  renderWithProviders(
    <Route path="/" component={() => <TestComponent q={query} isLoggedIn />} />,
    {
      withKBar: true,
      withRouter: true,
      storeInitialState,
    },
  );
};
