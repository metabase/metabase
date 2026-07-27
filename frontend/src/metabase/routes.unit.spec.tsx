import fetchMock from "fetch-mock";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { LegacyBrowseRedirect } from "./routes";
import {
  type EntityIdRedirectProps,
  createEntityIdRedirect,
} from "./routes-stable-id-aware";

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

describe("dashboard entity-id deep links", () => {
  const DASHBOARD_EID = "xBLdW9FsgRuB2HGhWiBa_";
  const TAB_EID = "N-o1tJ9swdO4YJycqMA8P";
  const DASHCARD_EID = "19JbScZRjz5mSQ7chtjuY";
  const DASHBOARD_ID = 1;

  // Only the dashboard entity_id in the path is translated up front. The `?tab=`
  // and `#scrollTo=` entity IDs must survive the redirect so the dashboard can
  // resolve them client-side
  const dashboardRedirectConfig: EntityIdRedirectProps = {
    parametersToTranslate: [
      { name: "entity_id", resourceType: "dashboard", type: "param" },
    ],
  };

  function setupDashboard(initialRoute: string) {
    setupCurrentUserEndpoint(createMockUser());
    fetchMock.post("path:/api/eid-translation/translate", () => ({
      entity_ids: {
        [DASHBOARD_EID]: { status: "ok", id: DASHBOARD_ID, type: "dashboard" },
      },
    }));

    const { history } = renderWithProviders(
      <>
        <Route
          path="dashboard/entity/:entity_id/*"
          element={createEntityIdRedirect(dashboardRedirectConfig)}
        />
        <Route path="dashboard/:slug" element={<div>dashboard app</div>} />
      </>,
      { withRouter: true, initialRoute },
    );

    return history;
  }

  it("resolves the dashboard entity_id in the path to its numeric id", async () => {
    const history = setupDashboard(`/dashboard/entity/${DASHBOARD_EID}`);

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        `/dashboard/${DASHBOARD_ID}`,
      ),
    );
    expect(await screen.findByText("dashboard app")).toBeInTheDocument();
  });

  it("preserves the tab query param and scrollTo hash entity IDs through the redirect", async () => {
    const history = setupDashboard(
      `/dashboard/entity/${DASHBOARD_EID}?tab=${TAB_EID}#scrollTo=${DASHCARD_EID}`,
    );

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe(
        `/dashboard/${DASHBOARD_ID}`,
      ),
    );

    const location = history!.getCurrentLocation();
    // The tab entity_id is left for the dashboard to resolve...
    expect(location.search).toBe(`?tab=${TAB_EID}`);
    // ...and the scrollTo hash must not be dropped on the way through.
    expect(location.hash).toBe(`#scrollTo=${DASHCARD_EID}`);
  });
});
