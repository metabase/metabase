import React from "react";

import { renderWithProviders, screen } from "__support__/ui";

import { AppErrorDescriptor } from "metabase-types/store";
import { createMockAppState } from "metabase-types/store/mocks";

import PublicApp from "./PublicApp";

type SetupOpts = {
  error?: AppErrorDescriptor;
};

function setup({ error }: SetupOpts = {}) {
  const app = createMockAppState({ errorPage: error });
  renderWithProviders(
    <PublicApp>
      <h1 data-testid="test-content">Test</h1>
    </PublicApp>,
    { mode: "public", storeInitialState: { app }, withRouter: true },
  );
}

describe("PublicApp", () => {
  it("renders children", () => {
    setup();
    expect(screen.getByTestId("test-content")).toBeInTheDocument();
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
});
