import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import { setupMockSamlEndpoints } from "embedding-sdk/test/mocks/sso";

import { type MetabaseConfigProps, setup } from "./setup";

const setupSaml = (config: MetabaseConfigProps = {}) => {
  setupMockSamlEndpoints();
  return setup(config);
};

describe("useInitData - SAML authentication", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    fetchMock.restore();
  });

  it("should send API requests with session token if initialization and login are successful", async () => {
    const { popupMock } = setupSaml();

    expect(await screen.findByTestId("test-component")).toBeInTheDocument();

    const lastCallRequest = fetchMock.lastCall(
      "path:/api/user/current",
    )?.request;

    expect(lastCallRequest?.headers.get("X-Metabase-Session")).toEqual(
      "TEST_SESSION_TOKEN",
    );

    expect(popupMock.close).toHaveBeenCalled();
  });
});
