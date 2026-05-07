import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { State } from "metabase/redux/store";
import { createMockState } from "metabase/redux/store/mocks";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NavbarLibrarySection } from "../NavbarLibrarySection";

export const createChildCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 10,
    name: "Metrics",
    type: "library-metrics",
    is_library_root: true,
    location: "/1/",
    here: ["card"],
    below: ["card"],
    ...overrides,
  });
export const createLibraryCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 1,
    name: "Library",
    type: "library",
    location: "/",
    here: ["card"],
    below: ["card"],
    ...overrides,
  });
export const setup = ({
  collections = [createLibraryCollection()],
  isEnterprise = false,
}: {
  collections?: Collection[];
  isEnterprise?: boolean;
} = {}) => {
  let state: State;
  if (isEnterprise) {
    const settings = createMockSettings({
      "expand-library-in-nav": true,
      "remote-sync-enabled": true,
      "remote-sync-branch": "main",
      "remote-sync-type": "read-write",
      "token-features": createMockTokenFeatures({
        library: true,
        remote_sync: true,
      }),
    });
    setupPropertiesEndpoints(settings);
    state = createMockState({
      settings: mockSettings(settings),
      currentUser: createMockUser({ is_superuser: true }),
    });
    setupEnterpriseOnlyPlugin("library");
    const pluginNames: ENTERPRISE_PLUGIN_NAME[] = ["remote_sync"];
    pluginNames.forEach(setupEnterpriseOnlyPlugin);
  } else {
    const settings = {
      "expand-library-in-nav": true,
      "token-features": createMockTokenFeatures({ library: true }),
    };

    state = createMockState({
      settings: mockSettings(settings),
      currentUser: createMockUser({ is_superuser: true }),
    });
    setupEnterpriseOnlyPlugin("library");
  }

  setupSettingsEndpoints([]);

  return renderWithProviders(
    <Route
      path="/"
      component={() => (
        <NavbarLibrarySection
          collections={collections}
          selectedId={undefined}
          onItemSelect={jest.fn()}
        />
      )}
    />,
    {
      storeInitialState: state,
      withRouter: true,
      withDND: true,
    },
  );
};
