import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import type { JSX } from "react";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen, waitFor } from "__support__/ui";
import { SyncedEmbedFrame } from "metabase/public/components/EmbedFrame";
import type { AppErrorDescriptor } from "metabase/redux/store";
import { createMockAppState } from "metabase/redux/store/mocks";
import * as domUtils from "metabase/utils/dom";

import PublicApp, { parsePublicEntity } from "./PublicApp";

type SetupOpts = {
  name?: string;
  description?: string;
  actionButtons?: JSX.Element | null;
  error?: AppErrorDescriptor;
  hasEmbedBranding?: boolean;
  hash?: string;
  path?: string;
  initialRoute?: string;
};

function setup({
  error,
  hasEmbedBranding = true,
  hash = "",
  path = "/public/dashboard/:id",
  initialRoute,
  ...embedFrameProps
}: SetupOpts = {}) {
  const app = createMockAppState({ errorPage: error });
  const settings = mockSettings({ "hide-embed-branding?": !hasEmbedBranding });

  renderWithProviders(
    <Route
      path={path}
      component={(props) => (
        <PublicApp {...props}>
          <SyncedEmbedFrame {...embedFrameProps}>
            <h1 data-testid="test-content">Test</h1>
          </SyncedEmbedFrame>
        </PublicApp>
      )}
    />,
    {
      mode: "public",
      initialRoute: initialRoute ?? `/public/dashboard/UUID${hash}`,
      storeInitialState: { app, settings },
      withRouter: true,
    },
  );
}

describe("PublicApp", () => {
  it("renders children", () => {
    setup();
    expect(screen.getByTestId("test-content")).toBeInTheDocument();
  });

  it("renders name", () => {
    setup({ name: "My Title", description: "My Description" });
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.queryByText("My Description")).not.toBeInTheDocument();
  });

  it("renders description", async () => {
    setup({ name: "My Title", description: "My Description" });
    await userEvent.hover(getIcon("info"));
    expect(await screen.findByText("My Description")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    setup({
      actionButtons: <button key="test">Click Me</button>,
    });
    expect(
      screen.getByRole("button", { name: "Click Me" }),
    ).toBeInTheDocument();
  });

  it("renders branding", () => {
    setup();
    expect(screen.getByText("Powered by")).toBeInTheDocument();
  });

  it("renders not found page on error", async () => {
    setup({ error: { status: 404 } });
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    expect(screen.queryByTestId("test-content")).not.toBeInTheDocument();
  });

  it("renders error message", () => {
    setup({
      error: {
        status: 500,
        data: { error_code: "error", message: "Something went wrong" },
      },
    });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.queryByTestId("test-content")).not.toBeInTheDocument();
  });

  it("renders fallback error message", () => {
    setup({ error: { status: 500 } });
    expect(screen.getByText(/An error occurred/)).toBeInTheDocument();
    expect(screen.queryByTestId("test-content")).not.toBeInTheDocument();
  });

  it("renders branding in error states", () => {
    setup({ error: { status: 404 } });
    expect(screen.getByText("Powered by")).toBeInTheDocument();
  });

  it("hides branding in error states if it's turned off", () => {
    setup({ error: { status: 404 }, hasEmbedBranding: false });
    expect(screen.queryByText("Powered by")).not.toBeInTheDocument();
  });

  it("renders unlock form when password is required", () => {
    setup({
      error: {
        status: 403,
        data: { error_code: "public-link-password-required" },
      },
    });
    expect(
      screen.getByText("This link is password protected"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("unlock-password-input")).toBeInTheDocument();
    expect(screen.getByTestId("unlock-submit-button")).toBeInTheDocument();
    expect(screen.queryByTestId("test-content")).not.toBeInTheDocument();
  });

  it("submits the entered password with the parsed uuid to unlock the link", async () => {
    const reloadSpy = jest
      .spyOn(domUtils, "reload")
      .mockImplementation(() => undefined);
    fetchMock.post("path:/api/public/card/test-uuid/unlock", 200);

    setup({
      error: {
        status: 403,
        data: { error_code: "public-link-password-required" },
      },
      path: "/public/question/:uuid",
      initialRoute: "/public/question/test-uuid",
    });

    await userEvent.type(
      screen.getByTestId("unlock-password-input"),
      "hunter2",
    );
    await userEvent.click(screen.getByTestId("unlock-submit-button"));

    // We reload only after a successful unlock, and the unlock route is the only
    // one mocked — so this also proves the parsed `uuid` was passed through.
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());

    const body = await fetchMock.callHistory
      .lastCall("path:/api/public/card/test-uuid/unlock")
      ?.request?.json();
    expect(body).toEqual({ password: "hunter2" });
  });

  it("renders generic error for non-password 403", () => {
    setup({
      error: {
        status: 403,
        data: { error_code: "some-other-error", message: "Forbidden" },
      },
    });
    expect(screen.getByText("Forbidden")).toBeInTheDocument();
    expect(
      screen.queryByText("This link is password protected"),
    ).not.toBeInTheDocument();
  });

  describe("theming", () => {
    it("renders correctly without a theme parameter", () => {
      setup();

      const embedFrame = screen.getByTestId("embed-frame");

      expect(embedFrame).not.toHaveAttribute("data-embed-theme");
    });

    test.each(["night", "transparent"])(
      "correctly handles %s theme",
      (theme) => {
        setup({ hash: `#theme=${theme}` });
        expect(screen.getByTestId("embed-frame")).toHaveAttribute(
          "data-embed-theme",
          theme,
        );
      },
    );
  });
});

describe("parsePublicEntity", () => {
  it.each([
    {
      pathname: "/public/question/abc-123",
      expected: { uuid: "abc-123", entityType: "card" },
    },
    {
      pathname: "/public/dashboard/abc-123",
      expected: { uuid: "abc-123", entityType: "dashboard" },
    },
    {
      // A dashboard tab slug must not be captured as part of the uuid.
      pathname: "/public/dashboard/abc-123/4-overview",
      expected: { uuid: "abc-123", entityType: "dashboard" },
    },
    // Documents and actions are not password-protectable, so there's no entity.
    { pathname: "/public/document/abc-123", expected: null },
    { pathname: "/public/action/abc-123", expected: null },
    // No uuid present.
    { pathname: "/public/question/", expected: null },
    // Substring traps and non-public paths.
    { pathname: "/public/questionnaire/abc-123", expected: null },
    { pathname: "/embed/question/abc-123", expected: null },
    { pathname: "/some/other/path", expected: null },
  ])("parses $pathname", ({ pathname, expected }) => {
    expect(parsePublicEntity(pathname)).toEqual(expected);
  });
});
