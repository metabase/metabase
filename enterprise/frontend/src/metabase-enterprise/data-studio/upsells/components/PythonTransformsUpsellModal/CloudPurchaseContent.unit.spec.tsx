import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
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
  formattedTrialEndDate,
  pythonPrice = 250,
}: {
  isTrialFlow: boolean;
  formattedTrialEndDate?: string;
  pythonPrice?: number;
}) => {
  const handleModalClose = jest.fn();
  const onError = jest.fn();

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
      formattedTrialEndDate={formattedTrialEndDate}
      handleModalClose={handleModalClose}
      isTrialFlow={isTrialFlow}
      onError={onError}
      pythonPrice={pythonPrice}
    />,
    {
      storeInitialState: state,
    },
  );

  return { handleModalClose, onError };
};

describe("CloudPurchaseContent", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows due today as $0 in trial flow", () => {
    setup({
      isTrialFlow: true,
      formattedTrialEndDate: "Jan 1, 2026",
      pythonPrice: 250,
    });

    expect(screen.getByText("Due today:")).toBeInTheDocument();
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add to trial" }),
    ).toBeInTheDocument();
  });

  it("purchases transforms-advanced and closes parent modal on confirm", async () => {
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-advanced", 200);

    const { handleModalClose } = setup({
      isTrialFlow: false,
      pythonPrice: 250,
    });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm purchase" }),
    );

    await fetchMock.callHistory.flush();

    expect(
      fetchMock.callHistory
        .calls()
        .some(
          (call) =>
            call.url.endsWith("/api/ee/cloud-add-ons/transforms-advanced") &&
            call.options.method === "POST",
        ),
    ).toBe(true);

    expect(handleModalClose).toHaveBeenCalled();

    expect(
      screen.getByText("Setting up Python transforms, please wait"),
    ).toBeInTheDocument();
  });

  it("calls onError when the purchase request fails", async () => {
    fetchMock.post("path:/api/ee/cloud-add-ons/transforms-advanced", 500);

    const { onError } = setup({ isTrialFlow: false, pythonPrice: 250 });

    await userEvent.click(
      screen.getByRole("button", { name: "Confirm purchase" }),
    );

    await waitFor(() => {
      expect(onError).toHaveBeenCalled();
    });
  });
});
