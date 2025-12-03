import {
  findRequests,
  setupTokenActivationEndpoint,
  setupTokenStatusEndpoint,
  setupTokenStatusEndpointEmpty,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as domUtils from "metabase/lib/dom";
import type { User } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useUpsellFlow } from "./use-upsell-flow";

const TestComponent = ({
  campaign,
  location,
}: {
  campaign: string;
  location: string;
  currentUser?: object;
}) => {
  const { triggerUpsellFlow } = useUpsellFlow({ campaign, location });

  return (
    <div>
      {triggerUpsellFlow !== undefined ? (
        <button onClick={triggerUpsellFlow}>Trigger Upsell Flow</button>
      ) : (
        <div>Upsell flow is not available</div>
      )}
    </div>
  );
};

const setupContainer = ({
  campaign = "test campaign",
  location = "test location",
  currentUser = {
    first_name: "John",
    last_name: "Doe",
    email: "john.doe@example.com",
    is_superuser: true,
  },
  tokenActivation = true,
  isHosted = false,
}: Partial<{
  campaign: string;
  location: string;
  currentUser: Partial<User>;
  tokenActivation: boolean;
  isHosted: boolean;
}> = {}) => {
  const mockWindowOpen = jest.fn();
  Object.defineProperty(window, "open", {
    value: mockWindowOpen,
    writable: true,
  });

  const mockPostMessage = jest.fn();
  mockWindowOpen.mockReturnValue({
    postMessage: mockPostMessage,
  });

  const state = createMockState({
    settings: mockSettings({
      "site-name": "Basemeta",
      "store-url": "https://test-store.metabase.com",
      "is-hosted?": isHosted,
    }),
    currentUser: createMockUser(currentUser),
  });
  setupTokenStatusEndpointEmpty();
  setupTokenActivationEndpoint({
    success: tokenActivation,
  });

  const { rerender } = renderWithProviders(
    <div>
      <TestComponent campaign={campaign} location={location} />
    </div>,
    { storeInitialState: state, withUndos: true },
  );

  const view = () =>
    rerender(<TestComponent campaign={campaign} location={location} />);

  return {
    mockWindowOpen,
    mockPostMessage,
    view,
  };
};

describe("useUpsellFlow", () => {
  describe("triggerUpsellFlow", () => {
    it("should open store window with correct params", async () => {
      const { mockWindowOpen } = setupContainer({
        campaign: "branding",
        location: "branding-upsell-admin-screen",
        currentUser: {
          first_name: "John",
          last_name: "Coltrane",
          email: "john.coltrane@example.com",
          is_superuser: true,
        },
      });

      screen.getByRole("button", { name: "Trigger Upsell Flow" }).click();

      const encodedUrl = `return_url=${encodeURIComponent(window.location.href)}`;
      const userDetailsPart =
        "first_name=John&last_name=Coltrane&email=john.coltrane%40example.com&company=Basemeta";
      const utmParamsPart =
        "utm_source=product&utm_medium=upsell&utm_campaign=branding&utm_content=branding-upsell-admin-screen&source_plan=oss";
      expect(mockWindowOpen).toHaveBeenCalledWith(
        `https://test-store.metabase.com/checkout/upgrade/self-hosted?${encodedUrl}&${userDetailsPart}&${utmParamsPart}`,
        "_blank",
      );
    });

    it("should activate license when token is valid", async () => {
      const { view, mockPostMessage } = setupContainer({
        campaign: "branding",
        location: "branding-upsell-admin-screen",
      });

      screen.getByRole("button", { name: "Trigger Upsell Flow" }).click();

      jest.spyOn(domUtils, "reload").mockImplementation(() => undefined);

      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://test-store.metabase.com",
          data: {
            type: "license-token-created",
            source: "metabase-store",
            payload: {
              licenseToken: "token-abc-123",
            },
          },
        }),
      );

      await waitFor(async () => {
        const requests = await findRequests("PUT");
        expect(requests).toHaveLength(1);
      });

      await waitFor(() => {
        expect(domUtils.reload).toHaveBeenCalled();
      });

      await waitFor(() => {
        expect(mockPostMessage).toHaveBeenCalledWith(
          {
            type: "license-token-activated",
            payload: { success: true },
            source: "metabase-instance",
          },
          "https://test-store.metabase.com",
        );
      });

      setupTokenStatusEndpoint({ valid: true });
      view();

      await waitFor(() => {
        expect(
          screen.getByText("License activated successfully"),
        ).toBeInTheDocument();
      });
    });

    it("should display error and send message to store when token is invalid", async () => {
      const { mockPostMessage } = setupContainer({ tokenActivation: false });

      screen.getByRole("button", { name: "Trigger Upsell Flow" }).click();
      window.dispatchEvent(
        new MessageEvent("message", {
          source: window,
          origin: "https://test-store.metabase.com",
          data: {
            type: "license-token-created",
            source: "metabase-store",
            payload: {
              licenseToken: "token-abc-123",
            },
          },
        }),
      );

      await waitFor(() => {
        expect(mockPostMessage).toHaveBeenCalledWith(
          {
            type: "license-token-activated",
            payload: { success: false },
            source: "metabase-instance",
          },
          "https://test-store.metabase.com",
        );
      });

      await waitFor(async () => {
        const requests = await findRequests("PUT");
        expect(requests).toHaveLength(1);
      });

      await waitFor(() => {
        expect(
          screen.getByText(
            "This token doesn't seem to be valid. Double-check it, then contact support if you think it should be working.",
          ),
        ).toBeInTheDocument();
      });
    });

    it("should not show upsell flow if the instance is hosted", () => {
      setupContainer({ isHosted: true });
      expect(
        screen.getByText("Upsell flow is not available"),
      ).toBeInTheDocument();
    });
  });
});
