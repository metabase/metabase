import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import {
  setupUndoUnsubscribeFromPulseEndpoint,
  setupUnsubscribeFromPulseEndpoint,
} from "__support__/server-mocks";
import {
  setupUndoUnsubscribeFromNotificationByEmailEndpoint,
  setupUnsubscribeFromNotificationByEmailEndpoint,
} from "__support__/server-mocks/notification";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { Route } from "metabase/router";
import type { IllustrationSettingValue } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { UnsubscribePage } from "./Unsubscribe";

jest.mock("metabase/common/components/LighthouseIllustration", () => ({
  LighthouseIllustration: () => <div data-testid="lighthouse-illustration" />,
}));

const ILLUSTRATION_URL =
  "api/session/illustration/login-page-illustration-custom?v=0123456789abcdef";

interface SetupOpts {
  loginPageIllustration?: IllustrationSettingValue;
  subscriptionType?: "pulse" | "notification";
  query?: string;
  status?: number;
}

const setup = ({
  loginPageIllustration = "default",
  subscriptionType = "pulse",
  query = subscriptionType === "pulse"
    ? "hash=hash&email=recipient%40example.com&pulse-id=1"
    : "hash=hash&email=recipient%40example.com&notification-handler-id=1",
  status = 200,
}: SetupOpts = {}) => {
  const settings = mockSettings({
    // A non-SVG data URI renders without a fetch of the whitelabel logo
    "application-logo-url": "data:image/png;base64,iVBORw0KGgo=",
    "login-page-illustration": loginPageIllustration,
    "login-page-illustration-custom": ILLUSTRATION_URL,
    "token-features": createMockTokenFeatures({ whitelabel: true }),
  });
  setupEnterpriseOnlyPlugin("whitelabel");
  const response = { title: "Orders alert" };
  if (subscriptionType === "pulse") {
    setupUnsubscribeFromPulseEndpoint(response, { status });
    setupUndoUnsubscribeFromPulseEndpoint(response);
  } else {
    setupUnsubscribeFromNotificationByEmailEndpoint(response, { status });
    setupUndoUnsubscribeFromNotificationByEmailEndpoint(response);
  }

  renderWithProviders(
    <Route path="/unsubscribe" element={<UnsubscribePage />} />,
    {
      withRouter: true,
      initialRoute: `/unsubscribe?${query}`,
      storeInitialState: { settings },
    },
  );
};

describe("UnsubscribePage (EE with whitelabel)", () => {
  it("should show a custom login page illustration", async () => {
    setup({ loginPageIllustration: "custom" });

    expect(
      await screen.findByRole("button", { name: "Confirm unsubscribe" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("unsubscribe-page-illustration")).toHaveStyle({
      backgroundImage: `url("${ILLUSTRATION_URL}")`,
    });
  });

  it("should show the lighthouse illustration by default", async () => {
    setup({ loginPageIllustration: "default" });

    expect(
      await screen.findByRole("button", { name: "Confirm unsubscribe" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lighthouse-illustration")).toBeInTheDocument();
  });

  it("should not show an illustration when it is turned off", async () => {
    setup({ loginPageIllustration: "none" });

    expect(
      await screen.findByRole("button", { name: "Confirm unsubscribe" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("unsubscribe-page-illustration"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("lighthouse-illustration"),
    ).not.toBeInTheDocument();
  });
});

describe.each(["pulse", "notification"] as const)(
  "UnsubscribePage (%s)",
  (subscriptionType) => {
    const endpoint = `/api/${subscriptionType}/unsubscribe`;

    it("requires confirmation before unsubscribing (metabase#83690)", async () => {
      setup({ subscriptionType });

      await screen.findByRole("button", { name: "Confirm unsubscribe" });
      expect(screen.getByText("recipient@example.com")).toBeInTheDocument();
      expect(fetchMock.callHistory.calls(`path:${endpoint}`)).toHaveLength(0);
      expect(fetchMock.callHistory.calls(`path:${endpoint}/undo`)).toHaveLength(
        0,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Confirm unsubscribe" }),
      );
      expect(await screen.findByText(/You've unsubscribed/)).toHaveTextContent(
        'You\'ve unsubscribed recipient@example.com from the "Orders alert" alert.',
      );
      expect(fetchMock.callHistory.calls(`path:${endpoint}`)).toHaveLength(1);
      const body: unknown = await fetchMock.callHistory
        .lastCall(`path:${endpoint}`)
        ?.request?.json();
      expect(body).toEqual({
        hash: "hash",
        email: "recipient@example.com",
        [subscriptionType === "pulse" ? "pulse-id" : "notification-handler-id"]:
          "1",
      });

      await userEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(await screen.findByText(/is subscribed to/)).toHaveTextContent(
        'Okay, recipient@example.com is subscribed to the "Orders alert" alert again.',
      );
      expect(fetchMock.callHistory.calls(`path:${endpoint}/undo`)).toHaveLength(
        1,
      );

      await userEvent.click(
        screen.getByRole("button", { name: "Unsubscribe" }),
      );
      expect(
        await screen.findByText(/You've unsubscribed/),
      ).toBeInTheDocument();
      expect(fetchMock.callHistory.calls(`path:${endpoint}`)).toHaveLength(2);
    });

    it("shows an error if the confirmed unsubscribe fails", async () => {
      setup({ subscriptionType, status: 500 });
      await userEvent.click(
        await screen.findByRole("button", { name: "Confirm unsubscribe" }),
      );
      expect(await screen.findByLabelText("error message")).toBeInTheDocument();
      expect(screen.queryByText(/You've unsubscribed/)).not.toBeInTheDocument();
    });
  },
);

describe("UnsubscribePage invalid links", () => {
  it.each([
    "email=recipient%40example.com&pulse-id=1",
    "hash=hash&pulse-id=1",
    "hash=hash&email=recipient%40example.com",
  ])("rejects missing parameters: %s", async (query) => {
    setup({ query });
    expect(await screen.findByLabelText("error page")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.calls("path:/api/pulse/unsubscribe"),
    ).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Confirm unsubscribe" }),
    ).not.toBeInTheDocument();
  });
});
