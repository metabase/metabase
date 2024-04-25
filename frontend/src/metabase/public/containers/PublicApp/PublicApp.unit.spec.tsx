import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { mockSettings } from "__support__/settings";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import type { AppErrorDescriptor } from "metabase-types/store";
import { createMockAppState } from "metabase-types/store/mocks";

import EmbedFrame from "../../components/EmbedFrame";

import PublicApp from "./PublicApp";

type SetupOpts = {
  name?: string;
  description?: string;
  actionButtons?: JSX.Element[];
  error?: AppErrorDescriptor;
  hasEmbedBranding?: boolean;
  hash?: string;
};

function setup({
  error,
  hasEmbedBranding = true,
  hash = "",
  ...embedFrameProps
}: SetupOpts = {}) {
  const app = createMockAppState({ errorPage: error });
  const settings = mockSettings({ "hide-embed-branding?": !hasEmbedBranding });

  renderWithProviders(
    <Route
      path="/public/dashboard/:id"
      component={props => (
        <PublicApp {...props}>
          <EmbedFrame {...embedFrameProps}>
            <h1 data-testid="test-content">Test</h1>
          </EmbedFrame>
        </PublicApp>
      )}
    />,
    {
      mode: "public",
      initialRoute: `/public/dashboard/UUID${hash}`,
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
    expect(screen.getByText("My Description")).toBeInTheDocument();
  });

  it("renders action buttons", () => {
    setup({ actionButtons: [<button key="test">Click Me</button>] });
    expect(
      screen.getByRole("button", { name: "Click Me" }),
    ).toBeInTheDocument();
  });

  it("renders branding", () => {
    setup();
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByText(/Metabase/)).toBeInTheDocument();
  });

  it("renders not found page on error", () => {
    setup({ error: { status: 404 } });
    expect(screen.getByText("Not found")).toBeInTheDocument();
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
    expect(screen.getByText(/Powered by/i)).toBeInTheDocument();
    expect(screen.getByText(/Metabase/)).toBeInTheDocument();
  });

  it("hides branding in error states if it's turned off", () => {
    setup({ error: { status: 404 }, hasEmbedBranding: false });
    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Metabase/)).not.toBeInTheDocument();
  });

  describe("theming", () => {
    it("renders correctly without a theme parameter", () => {
      setup();

      const embedFrame = screen.getByTestId("embed-frame");

      expect(embedFrame).not.toHaveAttribute("data-embed-theme");
    });

    test.each(["night", "transparent"])("correctly handles %s theme", theme => {
      setup({ hash: `#theme=${theme}` });
      expect(screen.getByTestId("embed-frame")).toHaveAttribute(
        "data-embed-theme",
        theme,
      );
    });
  });
});
