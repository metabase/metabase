import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";

import { useHasSsoEnabled } from "./utils";

describe("useHasSsoEnabled", () => {
  it("returns true when OIDC is the only enabled SSO provider", async () => {
    setupPropertiesEndpoints(createMockSettings({ "oidc-enabled": true }));

    const { result } = renderHookWithProviders(() => useHasSsoEnabled(), {});

    await waitFor(() => {
      expect(result.current).toBeTruthy();
    });
  });

  it("returns false when no SSO providers are enabled", async () => {
    setupPropertiesEndpoints(
      createMockSettings({
        "oidc-enabled": false,
        "saml-enabled": false,
        "jwt-enabled": false,
        "ldap-enabled": false,
        "google-auth-enabled": false,
      }),
    );

    const { result } = renderHookWithProviders(() => useHasSsoEnabled(), {});

    await waitFor(() => {
      expect(result.current).toBeFalsy();
    });
  });
});
