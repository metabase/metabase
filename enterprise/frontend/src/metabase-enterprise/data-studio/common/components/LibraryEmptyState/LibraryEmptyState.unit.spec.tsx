import userEvent from "@testing-library/user-event";

import {
  setupCreateLibraryEndpoint,
  setupCreateLibraryEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { LibraryEmptyState } from "./LibraryEmptyState";

type SetupOpts = {
  hasCreateError?: boolean;
};

function setup({ hasCreateError }: SetupOpts = {}) {
  if (hasCreateError) {
    setupCreateLibraryEndpointError();
  } else {
    setupCreateLibraryEndpoint();
  }

  renderWithProviders(<LibraryEmptyState />);
}

describe("LibraryEmptyState", () => {
  it("should be able to create the library", async () => {
    setup();
    await userEvent.click(screen.getByText("Create my Library"));
    await waitFor(() =>
      expect(screen.queryByText("Create my Library")).not.toBeInTheDocument(),
    );
  });

  it("should show a library creation error", async () => {
    setup({ hasCreateError: true });
    await userEvent.click(screen.getByText("Create my Library"));
    expect(await screen.findByText("Something went wrong")).toBeInTheDocument();
  });
});
