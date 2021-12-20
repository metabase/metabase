import {
  act,
  fireEvent,
  screen,
  waitForElement,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import xhrMock from "xhr-mock";
import { renderWithProviders } from "__support__/ui";
import LicenseAndBillingSettings from ".";
import MetabaseSettings from "metabase/lib/settings";

const mockStoreManagedKey = (isStoreManaged = true) => {
  const original = MetabaseSettings.get.bind(MetabaseSettings);
  const spy = jest.spyOn(MetabaseSettings, "get");
  spy.mockImplementation(key => {
    if (key === "metabase-store-managed") {
      return isStoreManaged;
    }

    return original(key);
  });
};

const mockTokenStatus = (valid: boolean) => {
  xhrMock.get("/api/premium-features/token/status", {
    body: JSON.stringify({
      valid,
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
    mockTokenStatus(true);
    mockStoreManagedKey(true);

    renderWithProviders(<LicenseAndBillingSettings />);

    expect(
      await screen.findByText(
        "Manage your Cloud account, including billing preferences, in your Metabase Store account.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Go to the Metabase Store")).toBeInTheDocument();

    expect(screen.getByTestId("license-input")).toBeDisabled();
    expect(
      screen.getByText("Your license is active! Hope you’re enjoying it."),
    ).toBeInTheDocument();
  });

  it("renders settings for non-store-managed billing with a valid token", async () => {
    mockTokenStatus(true);
    mockStoreManagedKey(false);

    renderWithProviders(<LicenseAndBillingSettings />);

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
      screen.getByText("Your license is active! Hope you’re enjoying it."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("license-input")).toBeDisabled();
  });

  it("renders settings for unlicensed instances", async () => {
    mockTokenNotExist();
    renderWithProviders(<LicenseAndBillingSettings />);

    expect(await screen.findByText("Looking for more?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Metabase is open source and will be free forever – but by upgrading you can have priority support, more tools to help you share your insights with your teams and powerful options to help you create seamless, interactive data experiences for your customers.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Explore our paid plans")).toHaveAttribute(
      "href",
      "https://www.metabase.com/pricing/",
    );
  });

  it("shows an error when entered license is not valid", async () => {
    mockTokenNotExist();
    mockUpdateToken(false);
    renderWithProviders(<LicenseAndBillingSettings />);

    expect(await screen.findByText("Looking for more?")).toBeInTheDocument();

    const licenseInput = screen.getByTestId("license-input");
    const activateButton = screen.getByTestId("activate-button");

    await act(async () => {
      await fireEvent.change(licenseInput, { target: { value: "license" } });
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
    renderWithProviders(<LicenseAndBillingSettings />);

    expect(await screen.findByText("Looking for more?")).toBeInTheDocument();

    const licenseInput = screen.getByTestId("license-input");
    const activateButton = screen.getByTestId("activate-button");

    await act(async () => {
      await fireEvent.change(licenseInput, { target: { value: "license" } });
      await fireEvent.click(activateButton);
    });

    expect(window.location.reload).toHaveBeenCalled();
  });
});
