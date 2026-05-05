import userEvent from "@testing-library/user-event";

import {
  setupCreateLibraryEndpoint,
  setupCreateLibraryEndpointError,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { CreateLibraryModal } from "./CreateLibraryModal";

type SetupOpts = {
  hasCreateError?: boolean;
};

function setup({ hasCreateError }: SetupOpts = {}) {
  const onCreate = jest.fn();
  const onClose = jest.fn();

  if (hasCreateError) {
    setupCreateLibraryEndpointError();
  } else {
    setupCreateLibraryEndpoint();
  }

  renderWithProviders(
    <CreateLibraryModal isOpened onCreate={onCreate} onClose={onClose} />,
  );

  return { onCreate, onClose };
}

describe("CreateLibraryModal", () => {
  it("should be able to create the library", async () => {
    const { onCreate } = setup();
    await userEvent.click(screen.getByText("Create my Library"));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
  });

  it("should show a library creation error", async () => {
    const { onCreate } = setup({ hasCreateError: true });
    await userEvent.click(screen.getByText("Create my Library"));
    expect(await screen.findByText("An error occurred")).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
