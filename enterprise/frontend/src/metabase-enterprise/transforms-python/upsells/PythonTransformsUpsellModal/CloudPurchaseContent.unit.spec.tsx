import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { CloudPurchaseContent } from "./CloudPurchaseContent";

const setup = ({
  isTrialFlow,
  pythonPrice = 250,
}: {
  isTrialFlow: boolean;
  pythonPrice?: number;
}) => {
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
    <CloudPurchaseContent
      billingPeriod="yearly"
      handleModalClose={handleModalClose}
      isTrialFlow={isTrialFlow}
      pythonPrice={pythonPrice}
    />,
    {
      storeInitialState: state,
    },
  );

  return { handleModalClose };
};

describe("CloudPurchaseContent", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows due today as $0 in trial flow", () => {
    setup({
      isTrialFlow: true,
      pythonPrice: 250,
    });

    expect(screen.getByText("Due today:")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add to trial" }),
    ).toBeInTheDocument();
  });

  it("shows setting up modal while purchase is in progress", async () => {
    let resolveRequest!: (value: unknown) => void;
    const pendingResponse = new Promise((resolve) => {
      resolveRequest = resolve;
    });

    fetchMock.post(
      "path:/api/ee/cloud-add-ons/transforms-advanced",
      pendingResponse,
    );

    setup({
      isTrialFlow: false,
      pythonPrice: 250,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm purchase" }),
    );

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
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-advanced", 200);

    const { handleModalClose } = setup({
      isTrialFlow: false,
      pythonPrice: 250,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm purchase" }),
    );

    await waitFor(() => {
      expect(
        fetchMock.callHistory
          .calls()
          .some(
            (call) =>
              call.url.endsWith("/api/ee/cloud-add-ons/transforms-advanced") &&
              call.options.method === "POST",
          ),
      ).toBe(true);
    });

    // After success, the finally block closes the parent modal
    await waitFor(() => {
      expect(handleModalClose).toHaveBeenCalled();
    });
  });

  it("closes setting up modal and parent modal on error", async () => {
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-advanced", 500);

    const { handleModalClose } = setup({
      isTrialFlow: false,
      pythonPrice: 250,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm purchase" }),
    );

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
