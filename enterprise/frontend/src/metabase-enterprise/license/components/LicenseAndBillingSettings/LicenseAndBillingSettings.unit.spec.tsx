import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupTokenStatusEndpoint,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockSettingsState } from "metabase/redux/store/mocks";
import type {
  BillingInfo,
  BillingInfoLineItem,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { getBillingInfoId } from "../BillingInfo/utils";

import { LicenseAndBillingSettings } from "./LicenseAndBillingSettings";

const selfHostedBillingInfo: BillingInfo = {
  version: "v1",
  content: [
    {
      name: "Visit the Metabase store to manage your account and billing preferences.",
      value: "Manage account",
      format: "string",
      display: "external-link",
      link: "https://store.metabase.com/account/manage/plans",
    },
    {
      name: "Cancel your Metabase Starter plan",
      value: "Cancel subscription",
      format: "string",
      display: "external-link",
      link: "https://store.metabase.com/account/cancel",
    },
  ],
};

const setup = async ({
  token = "token",
  is_env_setting = false,
  airgapEnabled = false,
  features = {},
  billingInfo,
  billingError = false,
}: {
  token?: string | null;
  is_env_setting?: boolean;
  airgapEnabled?: boolean;
  features?: Partial<TokenFeatures> & { "metabase-store-managed"?: boolean };
  billingInfo?: BillingInfo;
  billingError?: boolean;
}) => {
  const settings = createMockSettings({
    "airgap-enabled": airgapEnabled,
    "premium-embedding-token": token,
    "token-features": createMockTokenFeatures(features),
  });

  setupSettingsEndpoints([
    {
      key: "premium-embedding-token",
      is_env_setting,
      env_name: "MB_PREMIUM_EMBEDDING_TOKEN",
      value: token,
    },
    {
      key: "airgap-enabled",
      value: airgapEnabled,
    },
  ]);

  setupPropertiesEndpoints(settings);
  setupTokenStatusEndpoint({
    valid: !!token && token !== "invalid",
    features: Object.keys(features),
  });
  setupUpdateSettingEndpoint();

  if (billingError) {
    fetchMock.get("path:/api/ee/billing", 500);
  } else if (billingInfo !== undefined) {
    fetchMock.get("path:/api/ee/billing", billingInfo);
  } else if (token && token !== "invalid") {
    fetchMock.get("path:/api/ee/billing", selfHostedBillingInfo);
  }

  renderWithProviders(<LicenseAndBillingSettings />, {
    storeInitialState: {
      settings: createMockSettingsState(settings),
    },
  });

  await screen.findByTestId("license-and-billing-content");
};

describe("LicenseAndBilling", () => {
  beforeEach(() => {
    jest.spyOn(dayjs.prototype, "diff").mockReturnValue(27209);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("render store info", () => {
    it("should render valid store billing info", async () => {
      const plan: BillingInfoLineItem = {
        name: "Plan",
        value: "Metabase Cloud Pro",
        format: "string",
        display: "value",
      };
      const users: BillingInfoLineItem = {
        name: "Users",
        value: 4000,
        format: "integer",
        display: "internal-link",
        link: "user-list",
      };
      const nextCharge: BillingInfoLineItem = {
        name: "Next charge",
        value: "2024-01-22T13:08:54Z",
        format: "datetime",
        display: "value",
      };
      const billingFreq: BillingInfoLineItem = {
        name: "Billing frequency",
        value: "Monthly",
        format: "string",
        display: "value",
      };
      const nextChargeValue: BillingInfoLineItem = {
        name: "Next charge value",
        value: 500,
        format: "currency",
        currency: "USD",
        display: "value",
      };
      const float: BillingInfoLineItem = {
        name: "Pi",
        value: 3.14159,
        format: "float",
        display: "value",
        precision: 2,
      };
      const managePreferences: BillingInfoLineItem = {
        name: "Visit the Metabase store to manage your account and billing preferences.",
        value: "Manage preferences",
        format: "string",
        display: "external-link",
        link: "https://store.metabase.com/",
      };
      const mockData: BillingInfo = {
        version: "v1",
        content: [
          plan,
          users,
          nextCharge,
          billingFreq,
          nextChargeValue,
          float,
          managePreferences,
        ],
      };

      await setup({
        token: "valid",
        features: { "metabase-store-managed": true },
        billingInfo: mockData,
      });

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
      expect(
        await screen.findByText(managePreferences.name),
      ).toBeInTheDocument();
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

      expect(
        screen.getByText(
          "Your license is active until Dec 31, 2099! Hope you’re enjoying it.",
        ),
      ).toBeInTheDocument();
    });

    it("should not render store info with unknown format types, display types, or invalid data", async () => {
      // provide one valid value so the table renders
      const plan: BillingInfoLineItem = {
        name: "Plan",
        value: "Metabase Cloud Pro",
        format: "string",
        display: "value",
      };
      // mocking some future format that doesn't exist yet
      const unsupportedFormat: any = {
        name: "Unsupported format",
        value: "Unsupported format",
        format: "unsupported-format",
        display: "value",
      };
      // mocking some future display that doesn't exist yet
      const unsupportedDisplay: any = {
        name: "Unsupported display",
        value: "Unsupported display",
        format: "string",
        display: "unsupported-display",
      };
      // mocking some incorrect data we're not expecting
      const invalidValue: any = {
        name: "Invalid value",
      };
      const mockData: BillingInfo = {
        version: "v1",
        content: [plan, unsupportedFormat, unsupportedDisplay, invalidValue],
      };
      await setup({
        token: "token",
        features: { "metabase-store-managed": true },
        billingInfo: mockData,
      });

      // test unsupported display, unsupported format, and invalid items do not render
      expect(
        screen.queryByText(unsupportedFormat.name),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(unsupportedDisplay.name),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(invalidValue.name)).not.toBeInTheDocument();
    });
  });

  it("renders error for billing info for store managed billing and info request fails", async () => {
    await setup({
      token: "valid",
      features: { "metabase-store-managed": true },
      billingError: true,
    });

    expect(await screen.findByTestId("billing-info-error")).toBeInTheDocument();
  });

  it("renders billing links for store-managed self-hosted billing with a valid token", async () => {
    const mockData = selfHostedBillingInfo;
    const manageAccount = mockData.content?.[0];
    const cancelSubscription = mockData.content?.[1];

    await setup({
      token: "valid",
      features: { "metabase-store-managed": true },
      billingInfo: mockData,
    });

    expect(
      await screen.findByText(manageAccount?.name ?? ""),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(cancelSubscription?.name ?? ""),
    ).toBeInTheDocument();

    const manageAccountLink = await screen.findByTestId(
      `billing-info-value-${getBillingInfoId(manageAccount!)}`,
    );
    expect(manageAccountLink).toHaveTextContent("Manage account");
    expect(manageAccountLink).toHaveAttribute(
      "href",
      "https://store.metabase.com/account/manage/plans",
    );

    const cancelSubscriptionLink = await screen.findByTestId(
      `billing-info-value-${getBillingInfoId(cancelSubscription!)}`,
    );
    expect(cancelSubscriptionLink).toHaveTextContent("Cancel subscription");
    expect(cancelSubscriptionLink).toHaveAttribute(
      "href",
      "https://store.metabase.com/account/cancel",
    );

    expect(
      screen.getByText(
        "Your license is active until Dec 31, 2099! Hope you’re enjoying it.",
      ),
    ).toBeInTheDocument();
  });

  it("renders go-to-store for store-managed billing when billing info has no content", async () => {
    await setup({
      token: "valid",
      features: { "metabase-store-managed": true },
      billingInfo: { version: "v1" },
    });

    expect(
      await screen.findByText(
        "Manage your Cloud account, including billing preferences, in your Metabase Store account.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Go to the Metabase Store/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("billing-info-error")).not.toBeInTheDocument();
  });

  it("renders email fallback for non-store-managed billing with a valid token", async () => {
    await setup({ token: "valid" });

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

  it("renders settings for airgapped token", async () => {
    await setup({
      token: "valid",
      airgapEnabled: true,
    });

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
      screen.getByText("Your token expires in 27209 days."),
    ).toBeInTheDocument();
  });

  it("renders settings for unlicensed instances", async () => {
    await setup({ token: null });

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();
  });

  it("renders disabled input when tokens specified with an env variable", async () => {
    await setup({ is_env_setting: true });

    expect(
      await screen.findByPlaceholderText("Using MB_PREMIUM_EMBEDDING_TOKEN"),
    ).toBeDisabled();
  });

  it("does not render an input when token has hosting feature enabled", async () => {
    await setup({ features: { hosting: true } });
    expect(await screen.findByText("Billing")).toBeInTheDocument();
    expect(screen.queryByTestId("license-input")).not.toBeInTheDocument();
  });

  it("shows an error when entered license is not valid", async () => {
    await setup({ token: null });

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();

    setupUpdateSettingEndpoint({ status: 400 });

    await userEvent.type(screen.getByTestId("license-input"), "invalid");
    await userEvent.click(await screen.findByTestId("activate-button"));

    expect(
      await screen.findByText(
        "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an message on a 503 (error accessing metabase store)", async () => {
    await setup({ token: null });

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();

    setupUpdateSettingEndpoint({ status: 503 });

    await userEvent.type(screen.getByTestId("license-input"), "invalid");
    await userEvent.click(await screen.findByTestId("activate-button"));

    expect(
      await screen.findByText(
        "We're having trouble validating your token. Please double-check that your instance can connect to Metabase's servers.",
      ),
    ).toBeInTheDocument();
  });
});
