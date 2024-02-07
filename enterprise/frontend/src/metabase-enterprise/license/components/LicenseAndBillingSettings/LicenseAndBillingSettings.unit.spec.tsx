import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";
import { Route } from "react-router";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockAdminState } from "metabase-types/store/mocks";

import { getBillingInfoId } from "../BillingInfo/utils";
import LicenseAndBillingSettings from "./LicenseAndBillingSettings";

const setupState = ({
  token,
  is_env_setting = false,
  env_name,
}: {
  token?: string;
  is_env_setting?: boolean;
  env_name?: string;
  features?: string[];
}) => {
  const admin = createMockAdminState({
    settings: {
      settings: [
        {
          key: "premium-embedding-token",
          is_env_setting,
          env_name,
          value: token,
        },
      ],
    },
  });

  return {
    storeInitialState: {
      admin,
    },
  };
};

const mockTokenStatus = (valid: boolean, features: string[] = []) => {
  fetchMock.get("path:/api/premium-features/token/status", {
    valid,
    "valid-thru": "2099-12-31T12:00:00",
    features,
  });
};

const mockTokenNotExist = () => {
  fetchMock.get("path:/api/premium-features/token/status", 404);
};

const mockUpdateToken = (valid: boolean) => {
  fetchMock.put("path:/api/setting/premium-embedding-token", valid ? 200 : 400);
};

describe("LicenseAndBilling", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders billing info for store managed billing with a valid token", async () => {
    mockTokenStatus(true, ["metabase-store-managed"]);

    const plan = {
      name: "Plan",
      value: "Metabase Cloud Pro",
      format: "string",
      display: "value",
    };
    const users = {
      name: "Users",
      value: 4000,
      format: "integer",
      display: "internal-link",
      link: "user-list",
    };
    const nextCharge = {
      name: "Next charge",
      value: "2024-01-22T13:08:54Z",
      format: "datetime",
      display: "value",
    };
    const billingFreq = {
      name: "Billing frequency",
      value: "Monthly",
      format: "string",
      display: "value",
    };
    const nextChargeValue = {
      name: "Next charge value",
      value: 500,
      format: "currency",
      currency: "USD",
      display: "value",
    };
    const float = {
      name: "Pi",
      value: 3.14159,
      format: "float",
      display: "value",
      precision: 2,
    };
    const unsupportedFormat = {
      name: "Unsupported format",
      value: "Unsupported format",
      format: "unsupported-format",
      display: "value",
    };
    const unsupportedDisplay = {
      name: "Unsupported display",
      value: "Unsupported display",
      format: "string",
      display: "unsupported-display",
    };
    const invalidValue = {
      name: "Invalid value",
    };
    const managePreferences = {
      name: "Visit the Metabase store to manage your account and billing preferences.",
      value: "Manage preferences",
      format: "string",
      display: "external-link",
      link: "https://store.metabase.com/",
    };

    fetchMock.get("path:/api/ee/billing", {
      version: "v1",
      content: [
        plan,
        users,
        nextCharge,
        billingFreq,
        nextChargeValue,
        float,
        unsupportedFormat,
        unsupportedDisplay,
        invalidValue,
        managePreferences,
      ],
    });

    renderWithProviders(
      <Route path="/" component={LicenseAndBillingSettings}></Route>,
      { withRouter: true, ...setupState({ token: "token" }) },
    );

    // test string format
    expect(await screen.findByText(plan.name)).toBeInTheDocument();
    expect(await screen.findByText(plan.name)).toBeInTheDocument();

    // test integer format + internal-link display
    expect(await screen.findByText(users.name)).toBeInTheDocument();
    const userTableValue = await screen.findByTestId(
      `billing-info-value-${getBillingInfoId(users)}`,
    );
    expect(userTableValue).toHaveTextContent("4,000");
    expect(userTableValue).toHaveAttribute("href", "/admin/people");

    // test datetime format
    expect(await screen.findByText(nextCharge.name)).toBeInTheDocument();
    expect(
      await screen.findByText(`Monday, January 22, 2024`),
    ).toBeInTheDocument();

    // test currency
    expect(await screen.findByText(nextChargeValue.name)).toBeInTheDocument();
    expect(await screen.findByText(`$500.00`)).toBeInTheDocument();

    // test float
    expect(await screen.findByText(float.name)).toBeInTheDocument();
    expect(screen.queryByText("" + float.value)).not.toBeInTheDocument();
    expect(await screen.findByText("3.14")).toBeInTheDocument();

    // test internal + external-link displays
    expect(await screen.findByText(managePreferences.name)).toBeInTheDocument();
    const managePreferencesTableValue = await screen.findByTestId(
      `billing-info-value-${getBillingInfoId(managePreferences)}`,
    );
    expect(managePreferencesTableValue).toHaveTextContent(
      managePreferences.value,
    );
    expect(managePreferencesTableValue).toHaveAttribute(
      "href",
      managePreferences.link,
    );

    // test unsupported display, unsupported format, and invalid items do not render
    expect(screen.queryByText(unsupportedDisplay.name)).not.toBeInTheDocument();
    expect(screen.queryByText(unsupportedFormat.name)).not.toBeInTheDocument();
    expect(screen.queryByText(invalidValue.name)).not.toBeInTheDocument();

    expect(
      screen.getByText(
        "Your license is active until Dec 31, 2099! Hope you’re enjoying it.",
      ),
    ).toBeInTheDocument();
  });

  it("renders error for billing info for store managed billing and info request fails", async () => {
    mockTokenStatus(true, ["metabase-store-managed"]);
    fetchMock.get("path:/api/ee/billing", 500);

    renderWithProviders(
      <LicenseAndBillingSettings />,
      setupState({ token: "token" }),
    );

    expect(await screen.findByTestId("billing-info-error")).toBeInTheDocument();
  });

  it("renders settings for non-store-managed billing with a valid token", async () => {
    mockTokenStatus(true);

    renderWithProviders(
      <LicenseAndBillingSettings />,
      setupState({ token: "token" }),
    );

    expect(
      await screen.findByText(
        "To manage your billing preferences, please email",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("billing@metabase.com")).toHaveAttribute(
      "href",
      "mailto:billing@metabase.com",
    );

    expect(
      screen.getByText(
        "Your license is active until Dec 31, 2099! Hope you’re enjoying it.",
      ),
    ).toBeInTheDocument();
  });

  it("renders settings for unlicensed instances", async () => {
    mockTokenNotExist();
    renderWithProviders(<LicenseAndBillingSettings />, setupState({}));

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();
  });

  it("renders disabled input when tokens specified with an env variable", async () => {
    mockTokenNotExist();
    renderWithProviders(
      <LicenseAndBillingSettings />,
      setupState({
        token: "token",
        is_env_setting: true,
        env_name: "MB_PREMIUM_EMBEDDING_TOKEN",
      }),
    );

    expect(
      await screen.findByPlaceholderText("Using MB_PREMIUM_EMBEDDING_TOKEN"),
    ).toBeDisabled();
  });

  it("shows an error when entered license is not valid", async () => {
    mockTokenNotExist();
    mockUpdateToken(false);
    renderWithProviders(<LicenseAndBillingSettings />, setupState({}));

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();

    userEvent.type(screen.getByTestId("license-input"), "invalid");
    userEvent.click(screen.getByTestId("activate-button"));

    expect(
      await screen.findByText(
        "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes the page when license is accepted", async () => {
    mockTokenNotExist();
    mockUpdateToken(true);
    renderWithProviders(<LicenseAndBillingSettings />, setupState({}));

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();

    userEvent.type(screen.getByTestId("license-input"), "valid");
    userEvent.click(screen.getByTestId("activate-button"));
  });
});
