import { renderWithProviders, screen } from "__support__/ui";
import {
  getPermissionsBasePath,
  resetPermissionsBasePath,
} from "metabase/common/components/PermissionsBasePath/base-path";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { EmbeddingHubPermissionsPage } from "./EmbeddingHubPermissionsPage";

/**
 * This covers the page's own job: declaring the base path around whatever
 * the route renders, and putting it back on the way out. It does not cover
 * whether admin's URL builders (admin/permissions/utils/urls.ts) actually
 * read that module-level value -- that file is feature-tier and can't be
 * imported here, and there's no other test that exercises the two together.
 */
function setup() {
  return renderWithProviders(
    <Route
      path="/embedding/permissions"
      element={<EmbeddingHubPermissionsPage />}
    >
      <Route index element={<div>Permissions editor</div>} />
    </Route>,
    {
      withRouter: true,
      initialRoute: "/embedding/permissions",
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("EmbeddingHubPermissionsPage", () => {
  afterEach(() => {
    resetPermissionsBasePath();
  });

  it("renders the routed editor under its own title", async () => {
    setup();

    expect(
      await screen.findByRole("heading", { name: "Permissions" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Permissions editor")).toBeInTheDocument();
  });

  it("points the URL builders at the hub while mounted", async () => {
    setup();

    await screen.findByText("Permissions editor");

    expect(getPermissionsBasePath()).toBe("/embedding/permissions");
  });

  it("restores the admin base path on unmount", async () => {
    const { unmount } = setup();

    await screen.findByText("Permissions editor");
    unmount();

    // Otherwise Monitor's group link would keep pointing into the hub for the
    // rest of the session.
    expect(getPermissionsBasePath()).toBe("/admin/permissions");
  });
});
