import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import { setupMockSamlEndpoints } from "embedding-sdk-bundle/test/mocks/sso";

import { type MetabaseConfigProps, setup } from "./setup";

const setupSaml = (config: MetabaseConfigProps = {}) => {
  setupMockSamlEndpoints();
  return setup(config);
};

describe("useInitData - SAML authentication", () => {
  it("should send API requests with session token if initialization and login are successful", async () => {
    const { popupMock } = setupSaml();

    expect(await screen.findByTestId("test-component")).toBeInTheDocument();

    const lastCallRequest = fetchMock.callHistory.lastCall(
      "path:/api/user/current",
    )?.request;

    expect(lastCallRequest?.headers.get("X-Metabase-Session")).toEqual(
      "TEST_SESSION_TOKEN",
    );

    expect(popupMock.close).toHaveBeenCalled();
  });
});
