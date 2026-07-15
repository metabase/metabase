import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import { Route } from "metabase/router";

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
        <Route path="/" component={LandingPageRedirect} />
        <Route path="/custom" component={() => <div>custom page</div>} />
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
    const { history } = setup();

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/custom"),
    );
    expect(history?.getCurrentLocation().state).toEqual({
      preserveNavbarState: true,
    });
    expect(screen.getByText("custom page")).toBeInTheDocument();
  });

  it("prefixes a landing page that is missing a leading slash", async () => {
    jest.spyOn(PLUGIN_LANDING_PAGE, "getLandingPage").mockReturnValue("custom");
    const { history } = setup();

    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/custom"),
    );
  });
});
