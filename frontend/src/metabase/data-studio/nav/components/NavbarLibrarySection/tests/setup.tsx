import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import type { Collection } from "metabase-types/api";
import { createMockCollection } from "metabase-types/api/mocks";
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
  dirtyCollectionIds = [] as number[],
  isGitSyncVisible = true,
}: {
  collections?: Collection[];
  dirtyCollectionIds?: number[];
  isGitSyncVisible?: boolean;
} = {}) => {
  jest.spyOn(PLUGIN_REMOTE_SYNC, "useGitSyncVisible").mockReturnValue({
    isVisible: isGitSyncVisible,
    currentBranch: "main",
  });

  jest.spyOn(PLUGIN_REMOTE_SYNC, "useRemoteSyncDirtyState").mockReturnValue({
    isCollectionDirty: (id: number | string | undefined) =>
      typeof id === "number" && dirtyCollectionIds.includes(id),
  });

  // eslint-disable-next-line react/display-name
  PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge = () => (
    <div data-testid="remote-sync-status">BADGE</div>
  );

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
      storeInitialState: createMockState({
        settings: mockSettings({
          "expand-library-in-nav": true,
        }),
      }),
      withRouter: true,
      withDND: true,
    },
  );
};
