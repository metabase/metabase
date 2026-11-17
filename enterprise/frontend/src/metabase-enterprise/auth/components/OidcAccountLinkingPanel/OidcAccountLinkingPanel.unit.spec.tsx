import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";

import { OidcAccountLinkingPanel } from "./OidcAccountLinkingPanel";

describe("OidcAccountLinkingPanel", () => {
  it("links to each OIDC provider's account-linking flow", () => {
    renderWithProviders(<OidcAccountLinkingPanel />, {
      storeInitialState: createMockState({
        settings: mockSettings({
          "oidc-login-providers": [
            {
              type: "oidc",
              key: "okta",
              "login-prompt": "Okta",
              "sso-url": "http://localhost:3000/auth/sso/okta",
            },
          ],
        }),
      }),
    });

    expect(screen.getByText("Okta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link account" })).toHaveAttribute(
      "href",
      `http://localhost:3000/auth/sso/okta?link=true&redirect=${encodeURIComponent("/account/authentication")}`,
    );
  });
});
