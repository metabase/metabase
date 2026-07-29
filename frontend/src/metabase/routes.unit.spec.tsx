import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { LegacyBrowseRedirect } from "./routes";

function setup(initialRoute: string) {
  setupCurrentUserEndpoint(createMockUser());

  const { history } = renderWithProviders(
    <Route path="browse">
      <Route path="databases/:slug" element={<div>browse databases</div>} />
      <Route path=":dbIdAndSlug" element={<LegacyBrowseRedirect />} />
    </Route>,
    { withRouter: true, initialRoute },
  );

  return history;
}

describe("LegacyBrowseRedirect", () => {
  it("redirects a v48-era /browse/<dbId>-<slug> url onto /browse/databases", async () => {
    const history = setup("/browse/5-orders");

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        "/browse/databases/5-orders",
      ),
    );
    expect(screen.getByText("browse databases")).toBeInTheDocument();
  });

  it("does not redirect a segment without the legacy hyphenated shape", async () => {
    const history = setup("/browse/orders");

    expect(history?.getCurrentLocation().pathname).toBe("/browse/orders");
  });
});
