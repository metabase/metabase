import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { setupMockSamlEndpoints } from "embedding-sdk-bundle/test/mocks/sso";

import { type MetabaseConfigProps, setup } from "./setup";

const setupSaml = (config: MetabaseConfigProps = {}) => {
  setupMockSamlEndpoints();
  return setup(config);
};

describe("useInitData - SAML authentication", () => {
  // The mocked SAML popup completes the flow via a `process.nextTick`
  // postMessage that must land after the popup's message listener is
  // registered, plus a `setInterval`/`setTimeout` popup-close watchdog. This
  // ordering is genuine async timing, so run it with real timers.
  beforeEach(() => {
    jest.useRealTimers();
  });

  it("should send API requests with session token if initialization and login are successful", async () => {
    const { popupMock } = setupSaml();

    expect(await screen.findByTestId("test-component")).toBeInTheDocument();

    await waitFor(() => {
      const lastCallRequest = fetchMock.callHistory.lastCall(
        "path:/api/user/current",
      )?.request;

      expect(lastCallRequest?.headers.get("X-Metabase-Session")).toEqual(
        "TEST_SESSION_TOKEN",
      );
    });

    await waitFor(() => expect(popupMock.close).toHaveBeenCalled());
  });
});
