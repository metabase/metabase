import { Route } from "react-router";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import type { ENTERPRISE_PLUGIN_NAME } from "__support__/enterprise-typed";
import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type { Collection } from "metabase-types/api";
import {
  createMockCollection,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { State } from "metabase-types/store";
import { createMockState } from "metabase-types/store/mocks";

import { NavbarLibrarySection } from "../NavbarLibrarySection";

export const createChildCollection = (
  overrides: Partial<Collection> = {},
): Collection =>
  createMockCollection({
    id: 10,
    name: "Metrics",
    type: null,
    location: "/1/",
    here: ["card"],
    below: ["card"],
    ...overrides,
  } as Partial<Collection>);
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
  } as Partial<Collection>);
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
        data_studio: true,
        remote_sync: true,
      }),
    });
    setupPropertiesEndpoints(settings);
    state = createMockState({
      settings: mockSettings(settings),
      currentUser: createMockUser({ is_superuser: true }),
    });

    const pluginNames: ENTERPRISE_PLUGIN_NAME[] = ["library", "remote_sync"];
    pluginNames.forEach(setupEnterpriseOnlyPlugin);
  } else {
    state = createMockState({
      settings: mockSettings({
        "expand-library-in-nav": true,
      }),
      currentUser: createMockUser({ is_superuser: true }),
    });
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
