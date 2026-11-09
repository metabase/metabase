import fetchMock from "fetch-mock";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { OidcIdentity } from "metabase-enterprise/api";

import { OidcAccountLinkingPanel } from "./OidcAccountLinkingPanel";

const LINK_REDIRECT = encodeURIComponent("/account/authentication");

function createMockOidcIdentity(opts?: Partial<OidcIdentity>): OidcIdentity {
  return {
    key: "okta",
    "login-prompt": "Okta",
    "sso-url": "http://localhost:3000/auth/sso/okta",
    linked: false,
    ...opts,
  };
}

type SetupOpts = {
  identities: OidcIdentity[];
};

function setup({ identities }: SetupOpts) {
  fetchMock.get("path:/api/ee/sso/oidc-identities", identities, {
    name: "oidc-identities",
  });
  return renderWithProviders(<OidcAccountLinkingPanel />);
}

describe("OidcAccountLinkingPanel", () => {
  it("offers to link an unlinked provider through its link flow", async () => {
    setup({ identities: [createMockOidcIdentity()] });

    expect(await screen.findByText("Okta")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Link" })).toHaveAttribute(
      "href",
      `http://localhost:3000/auth/sso/okta?link=true&redirect=${LINK_REDIRECT}`,
    );
  });

  it("shows a linked provider and offers to link a different identity", async () => {
    setup({ identities: [createMockOidcIdentity({ linked: true })] });

    expect(
      await screen.findByText(
        "Your account is linked to an identity at this provider.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Link a different identity" }),
    ).toBeInTheDocument();
  });

  it("falls back to the provider key without a login prompt", async () => {
    setup({
      identities: [
        createMockOidcIdentity({ key: "auth0", "login-prompt": null }),
      ],
    });

    expect(await screen.findByText("auth0")).toBeInTheDocument();
  });

  it("renders nothing when no OIDC provider is enabled", async () => {
    const { container } = setup({ identities: [] });

    await waitFor(() =>
      expect(fetchMock.callHistory.called("oidc-identities")).toBe(true),
    );
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
