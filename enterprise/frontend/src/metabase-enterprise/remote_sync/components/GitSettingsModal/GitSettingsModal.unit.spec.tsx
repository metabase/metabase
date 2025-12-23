import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupRootCollectionItemsEndpoint,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { GitSettingsModal } from "./GitSettingsModal";

interface SetupOpts {
  isOpen?: boolean;
}

const setup = ({ isOpen = true }: SetupOpts = {}) => {
  const onClose = jest.fn();
  setupPropertiesEndpoints(createMockSettings());
  setupSettingsEndpoints([]);
  fetchMock.get("express:/api/ee/library", { data: null });
  fetchMock.get("path:/api/ee/remote-sync/dirty", { dirty: [] });
  fetchMock.put("path:/api/ee/remote-sync/settings", { success: true });
  setupRootCollectionItemsEndpoint({ rootCollectionItems: [] });

  renderWithProviders(<GitSettingsModal isOpen={isOpen} onClose={onClose} />);

  return { onClose };
};

describe("GitSettingsModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  describe("modal rendering", () => {
    it("should render modal when isOpen is true", async () => {
      setup({ isOpen: true });

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });
      // Modal title displays "Set up remote sync for your Library"
      expect(
        screen.getByText("Set up remote sync for your Library"),
      ).toBeInTheDocument();
      // Modal subtitle displays
      expect(
        screen.getByText(
          "Keep your Library and transforms safely backed up in Git.",
        ),
      ).toBeInTheDocument();
    });

    it("should not render modal when isOpen is false", () => {
      setup({ isOpen: false });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("should call onClose when cancel button is clicked", async () => {
    const { onClose } = setup({ isOpen: true });

    expect(
      screen.getByText("Set up remote sync for your Library"),
    ).toBeInTheDocument();

    expect(onClose).not.toHaveBeenCalled();

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    await userEvent.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });
});
