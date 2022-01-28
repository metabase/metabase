import { act, fireEvent, screen } from "@testing-library/react";
import React from "react";
import xhrMock from "xhr-mock";
import { renderWithProviders } from "__support__/ui";
import LicenseAndBillingSettings from ".";

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
  const settings = {
    values: {
      "token-features": {},
    },
  };

  const admin = {
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
  };
  return {
    storeInitialState: {
      admin,
      settings,
    },
    reducers: {
      settings: () => settings,
      admin: () => admin,
    },
  };
};

const mockTokenStatus = (valid: boolean, features: string[] = []) => {
  xhrMock.get("/api/premium-features/token/status", {
    body: JSON.stringify({
      valid,
      "valid-thru": "2099-12-31T12:00:00",
      features,
    }),
  });
};

const mockTokenNotExist = () => {
  xhrMock.get("/api/premium-features/token/status", {
    status: 404,
  });
};

const mockUpdateToken = (valid: boolean) => {
  if (valid) {
    xhrMock.put("/api/setting/premium-embedding-token", {
      status: 200,
    });
  } else {
    xhrMock.put("/api/setting/premium-embedding-token", {
      status: 400,
    });
  }
};

describe("LicenseAndBilling", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    delete window.location;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.location = { reload: jest.fn() };
    xhrMock.setup();
  });

  afterEach(() => {
    xhrMock.teardown();
    jest.restoreAllMocks();

    window.location = originalLocation;
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

    const licenseInput = screen.getByTestId("license-input");
    const activateButton = screen.getByTestId("activate-button");

    const token = "invalid";
    await act(async () => {
      await fireEvent.change(licenseInput, { target: { value: token } });
      await fireEvent.click(activateButton);
    });

    expect(
      await screen.findByText(
        "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.",
      ),
    ).toBeInTheDocument();
  });

  it("refreshes the page when license is accepted", async () => {
    window.location.reload = jest.fn();

    mockTokenNotExist();
    mockUpdateToken(true);
    renderWithProviders(<LicenseAndBillingSettings />, setupState({}));

    expect(
      await screen.findByText(
        "Bought a license to unlock advanced functionality? Please enter it below.",
      ),
    ).toBeInTheDocument();

    const licenseInput = screen.getByTestId("license-input");
    const activateButton = screen.getByTestId("activate-button");

    const token = "valid";
    await act(async () => {
      await fireEvent.change(licenseInput, { target: { value: token } });
      await fireEvent.click(activateButton);
    });

    expect(window.location.reload).toHaveBeenCalled();
  });
});
