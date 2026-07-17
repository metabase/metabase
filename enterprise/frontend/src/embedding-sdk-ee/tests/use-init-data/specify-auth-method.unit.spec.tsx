import { screen, waitFor } from "__support__/ui";
import {
  setupMockJwtEndpoints,
  setupMockSamlEndpoints,
} from "embedding-sdk-bundle/test/mocks/sso";

import { setup } from "./setup";

describe("useInitData - specifying authentication methods", () => {
  // The SAML case completes via the mocked popup's `process.nextTick`
  // postMessage and a `setInterval`/`setTimeout` watchdog — genuine async
  // timing — so run these with real timers.
  beforeEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ["jwt", setupMockJwtEndpoints],
    ["saml", setupMockSamlEndpoints],
  ] as const)(
    "can use %s as the preferred auth method",
    async (preferredAuthMethod, setupMockEndpoints) => {
      setupMockEndpoints();
      setup({ preferredAuthMethod });

      await waitFor(() =>
        expect(screen.getByTestId("test-component")).toHaveAttribute(
          "data-is-logged-in",
          "true",
        ),
      );

      expect(screen.getByTestId("test-component")).toHaveAttribute(
        "data-login-status",
        "success",
      );
    },
  );
});
