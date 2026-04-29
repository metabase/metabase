import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingsState,
  createMockState,
} from "metabase/redux/store/mocks";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { mockAdvancedTransformsAddOn } from "metabase-types/api/mocks/add-ons";

import { PurchaseAdvancedTransforms } from "./PurchaseAdvancedTransforms";

const setup = () => {
  const handleModalClose = jest.fn();

  const settings = createMockSettings({
    "token-status": {
      status: "valid",
      valid: true,
      features: [],
    },
    "token-features": createMockTokenFeatures({}),
  });

  const state = createMockState({
    settings: createMockSettingsState(settings),
  });

  setupPropertiesEndpoints(settings);

  renderWithProviders(
    <PurchaseAdvancedTransforms
      handleModalClose={handleModalClose}
      addOn={mockAdvancedTransformsAddOn}
      freeUnitsIncluded
    />,
    {
      storeInitialState: state,
    },
  );

  return { handleModalClose };
};

describe("PurchaseAdvancedTransforms", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows setting up modal while purchase is in progress", async () => {
    let resolveRequest!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    fetchMock.post(
      "path:/api/ee/cloud-add-ons/transforms-advanced-metered",
      pendingResponse,
    );

    setup();

    await userEvent.click(screen.getByRole("button", { name: "Upgrade" }));

    // While the request is in-flight, the setting up modal should be visible
    expect(
      screen.getByText("Setting up Python transforms, please wait"),
    ).toBeInTheDocument();

    // Resolve the request
    await act(async () => {
      resolveRequest(200);
    });
  });

  it("calls the API and closes parent modal on successful purchase", async () => {
    fetchMock.post(
      "path:/api/ee/cloud-add-ons/transforms-advanced-metered",
      200,
    );

    const { handleModalClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Upgrade" }));

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls()
          .some(
            (call) =>
              call.url.endsWith(
                "/api/ee/cloud-add-ons/transforms-advanced-metered",
              ) && call.options.method === "POST",
          ),
      ).toBe(true);
    });

    // After success, the finally block closes the parent modal
    await waitFor(() => {
      expect(handleModalClose).toHaveBeenCalled();
    });
  });

  it("closes setting up modal and parent modal on error", async () => {
    fetchMock.post(
      "path:/api/ee/cloud-add-ons/transforms-advanced-metered",
      500,
    );

    const { handleModalClose } = setup();

    await userEvent.click(screen.getByRole("button", { name: "Upgrade" }));

    // After error, finally block closes the parent modal
    await waitFor(() => {
      expect(handleModalClose).toHaveBeenCalled();
    });

    // Setting up modal should be closed (not visible)
    expect(
      screen.queryByText("Setting up Python transforms, please wait"),
    ).not.toBeInTheDocument();
  });
});
