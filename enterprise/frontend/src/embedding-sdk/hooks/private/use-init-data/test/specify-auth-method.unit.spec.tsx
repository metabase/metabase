import { screen } from "__support__/ui";
import {
  setupMockJwtEndpoints,
  setupMockSamlEndpoints,
} from "embedding-sdk/test/mocks/sso";

import { setup } from "./setup";

describe("useInitData - specifying authentication methods", () => {
  it.each([
    ["jwt", setupMockJwtEndpoints],
    ["saml", setupMockSamlEndpoints],
  ] as const)(
    "can use %s as the preferred auth method",
    async (authMethod, setupMockEndpoints) => {
      setupMockEndpoints({ isPreferredAuthMethod: true });
      setup({ authMethod });

      expect(await screen.findByTestId("test-component")).toHaveAttribute(
        "data-is-logged-in",
        "true",
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "success",
      );
    },
  );
});
