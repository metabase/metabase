import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupGetTransformEndpoint,
  setupPropertiesEndpoints,
  setupRemoteSyncEndpoints,
  setupSettingsEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { Outlet, Route } from "metabase/router";
import { TransformHeader } from "metabase/transforms/components/TransformHeader";
import type { Transform } from "metabase-types/api";
import {
  createMockCollection,
  createMockRemoteSyncWorktree,
  createMockSettings,
  createMockTokenFeatures,
  createMockTransform,
  createMockUser,
} from "metabase-types/api/mocks";

import { ContentStudioScopeProvider } from "../scope";

import { ContentStudioTransformLayout } from "./ContentStudioTransformLayout";
import { ContentStudioTransformsLayout } from "./ContentStudioTransformsLayout";

const BRANCH_TRANSFORM = createMockTransform({
  id: 2,
  name: "Branch revenue",
  collection_id: null,
  worktree_id: 7,
});

const FOLDER_TRANSFORM = createMockTransform({
  id: 3,
  name: "Weekly cohort",
  collection_id: 20,
  worktree_id: 7,
});

const FOLDER = createMockCollection({
  id: 20,
  name: "Reporting",
  namespace: "transforms",
  effective_ancestors: [],
});

const WORKTREE = createMockRemoteSyncWorktree({ id: 7, branch: "feature-a" });

function setup(transform: Transform = BRANCH_TRANSFORM) {
  const settings = createMockSettings({
    "remote-sync-enabled": true,
    "remote-sync-branch": "main",
    "remote-sync-type": "read-write",
    "remote-sync-transforms": true,
    "token-features": createMockTokenFeatures({ remote_sync: true }),
  });

  setupRemoteSyncEndpoints({ worktrees: [WORKTREE] });
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupUserMetabotPermissionsEndpoint();
  setupGetTransformEndpoint(transform);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection({ id: "root" }), FOLDER],
  });
  fetchMock.get("path:/api/transform", [transform]);
  fetchMock.get("path:/api/collection/tree", []);

  setupEnterpriseOnlyPlugin("remote_sync");

  renderWithProviders(
    <Route path="/">
      <Route
        path="content-studio"
        element={
          <ContentStudioScopeProvider>
            <Outlet />
          </ContentStudioScopeProvider>
        }
      >
        <Route path="transforms" element={<ContentStudioTransformsLayout />}>
          <Route path=":transformId" element={<ContentStudioTransformLayout />}>
            <Route index element={<TransformHeader transform={transform} />} />
          </Route>
        </Route>
      </Route>
    </Route>,
    {
      initialRoute: `/content-studio/transforms/${transform.id}`,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings(settings),
      }),
    },
  );
}

describe("Content Studio transform pages", () => {
  afterEach(() => {
    reinitialize();
  });

  it("keeps the transform tabs inside Content Studio", async () => {
    setup();

    expect(
      await screen.findByRole("tab", { name: "Definition" }),
    ).toHaveAttribute("href", "/content-studio/transforms/2");
    expect(screen.getByRole("tab", { name: "Run" })).toHaveAttribute(
      "href",
      "/content-studio/transforms/2/run",
    );
    expect(screen.getByRole("tab", { name: "Settings" })).toHaveAttribute(
      "href",
      "/content-studio/transforms/2/settings",
    );
    expect(screen.getByRole("tab", { name: "Indexes" })).toHaveAttribute(
      "href",
      "/content-studio/transforms/2/indexes",
    );
  });

  it("points the breadcrumb at the branch the transform belongs to", async () => {
    setup();

    expect(
      await screen.findByRole("link", { name: "Transforms" }),
    ).toHaveAttribute("href", "/content-studio/transforms?worktree=7");
  });

  it("names the containing folder without linking out of Content Studio", async () => {
    setup(FOLDER_TRANSFORM);

    expect(await screen.findByText("Reporting")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Reporting" }),
    ).not.toBeInTheDocument();
  });
});
