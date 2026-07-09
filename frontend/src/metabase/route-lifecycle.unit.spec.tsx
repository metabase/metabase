import fetchMock from "fetch-mock";

import { setupCurrentUserEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { PLUGIN_LANDING_PAGE } from "metabase/plugins";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import * as domUtils from "metabase/utils/dom";
import { createMockUser } from "metabase-types/api/mocks";

import {
  CardHashRedirect,
  LandingPageRedirect,
  LoadCurrentUser,
  QuestionHashRedirect,
  RedirectIfSetup,
  SsoReload,
} from "./route-lifecycle";

jest.mock("metabase/home/components/HomePage", () => ({
  HomePage: () => <div>home page</div>,
}));

const stateWithSetup = (hasUserSetup: boolean) =>
  createMockState({
    settings: createMockSettingsState({ "has-user-setup": hasUserSetup }),
  });

describe("RedirectIfSetup", () => {
  const setup = (hasUserSetup: boolean) =>
    renderWithProviders(
      <>
        <Route component={RedirectIfSetup}>
          <Route path="setup" component={() => <div>setup page</div>} />
        </Route>
        <Route path="/" component={() => <div>home page</div>} />
      </>,
      {
        storeInitialState: stateWithSetup(hasUserSetup),
        withRouter: true,
        initialRoute: "/setup",
      },
    );

  it("renders the setup page when the instance is not set up", () => {
    setup(false);
    expect(screen.getByText("setup page")).toBeInTheDocument();
  });

  it("redirects to the home page once the instance is set up", async () => {
    const { history } = setup(true);
    await waitFor(() =>
      expect(history?.getCurrentLocation().pathname).toBe("/"),
    );
    expect(screen.queryByText("setup page")).not.toBeInTheDocument();
  });
});

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

describe("SsoReload", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("reloads the page on mount", async () => {
    const reloadSpy = jest
      .spyOn(domUtils, "reload")
      .mockImplementation(() => undefined);

    renderWithProviders(<Route path="sso" component={SsoReload} />, {
      withRouter: true,
      initialRoute: "/sso",
    });

    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });
});

describe("QuestionHashRedirect", () => {
  it("redirects /q to /question, preserving the hash", async () => {
    const { history } = renderWithProviders(
      <>
        <Route path="/q" component={QuestionHashRedirect} />
        <Route path="/question" component={() => <div>question</div>} />
      </>,
      { withRouter: true, initialRoute: "/q#foo=bar" },
    );

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/question");
      expect(location?.hash).toBe("#foo=bar");
    });
  });
});

describe("CardHashRedirect", () => {
  it("redirects /card/:slug to /question/:slug, preserving the hash", async () => {
    const { history } = renderWithProviders(
      <>
        <Route path="/card/:slug" component={CardHashRedirect} />
        <Route path="/question/:slug" component={() => <div>question</div>} />
      </>,
      { withRouter: true, initialRoute: "/card/123-foo#bar=baz" },
    );

    await waitFor(() => {
      const location = history?.getCurrentLocation();
      expect(location?.pathname).toBe("/question/123-foo");
      expect(location?.hash).toBe("#bar=baz");
    });
  });
});

describe("LoadCurrentUser", () => {
  const setup = () =>
    renderWithProviders(
      <Route component={LoadCurrentUser}>
        <Route path="/" component={() => <div>app content</div>} />
      </Route>,
      {
        storeInitialState: createMockState({ currentUser: undefined }),
        withRouter: true,
        initialRoute: "/",
      },
    );

  it("gates its children until the current user has loaded", async () => {
    setupCurrentUserEndpoint(createMockUser());
    setup();

    expect(screen.queryByText("app content")).not.toBeInTheDocument();

    expect(await screen.findByText("app content")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls("path:/api/user/current")).toHaveLength(
      1,
    );
  });
});
