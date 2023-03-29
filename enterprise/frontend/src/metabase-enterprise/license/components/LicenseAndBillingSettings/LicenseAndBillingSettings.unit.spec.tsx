import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { createMockAdminState } from "metabase-types/store/mocks";

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

  it("renders settings for store managed billing with a valid token", async () => {
    mockTokenStatus(true, ["metabase-store-managed"]);

    renderWithProviders(
      <LicenseAndBillingSettings />,
      setupState({ token: "token" }),
    );

    expect(
      await screen.findByText(
        "Manage your Cloud account, including billing preferences, in your Metabase Store account.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Go to the Metabase Store")).toBeInTheDocument();

    expect(
      screen.getByText(
        "Your license is active until Dec 31, 2099! Hope you’re enjoying it.",
      ),
    ).toBeInTheDocument();
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
