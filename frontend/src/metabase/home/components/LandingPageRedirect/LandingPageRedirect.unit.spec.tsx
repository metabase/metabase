import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { Route } from "metabase/router";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { LandingPageRedirect } from "./LandingPageRedirect";

jest.mock("../HomePage", () => ({
  HomePage: () => <div>home page</div>,
}));

describe("LandingPageRedirect", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setup = () =>
    renderWithProviders(
      <>
        <Route path="/" element={<LandingPageRedirect />} />
        <Route path="/custom" element={<div>custom page</div>} />
      </>,
      { withRouter: true, initialRoute: "/" },
    );

  it("renders the home page when the landing page is the home page", () => {
    jest.spyOn(PLUGIN_LANDING_PAGE, "getLandingPage").mockReturnValue("/");
    setup();
    expect(screen.getByText("home page")).toBeInTheDocument();
  });

  it("redirects to the configured landing page, preserving navbar state", async () => {
    jest
      .spyOn(PLUGIN_LANDING_PAGE, "getLandingPage")
      .mockReturnValue("/custom");
    const { router } = setup();

    await waitFor(() => expect(router?.location.pathname).toBe("/custom"));
    expect(router?.location.state).toEqual({
      preserveNavbarState: true,
    });
    expect(screen.getByText("custom page")).toBeInTheDocument();
  });

  it("prefixes a landing page that is missing a leading slash", async () => {
    jest.spyOn(PLUGIN_LANDING_PAGE, "getLandingPage").mockReturnValue("custom");
    const { router } = setup();

    await waitFor(() => expect(router?.location.pathname).toBe("/custom"));
  });

  it("redirects to the landing-page setting with the whitelabel feature", async () => {
    mockSettings({
      "landing-page": "/custom",
      "token-features": createMockTokenFeatures({ whitelabel: true }),
    });
    setupEnterpriseOnlyPlugin("whitelabel");
    const { router } = setup();

    await waitFor(() => expect(router?.location.pathname).toBe("/custom"));
  });
});
