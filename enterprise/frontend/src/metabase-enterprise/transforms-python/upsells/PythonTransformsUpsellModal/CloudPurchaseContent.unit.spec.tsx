import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
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
});
