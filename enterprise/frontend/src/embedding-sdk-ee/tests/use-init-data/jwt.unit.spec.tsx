import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen } from "__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import {
  type JwtMockConfig,
  setupMockJwtEndpoints,
} from "embedding-sdk-bundle/test/mocks/sso";

import { setupEmbeddingSdkEnterprisePlugins } from "../support";

import { type MetabaseConfigProps, TestComponent, setup } from "./setup";

const setupJwt = ({
  providerResponse,
  ...config
}: MetabaseConfigProps & Pick<JwtMockConfig, "providerResponse"> = {}) => {
  setupMockJwtEndpoints(
    providerResponse
      ? {
          providerResponse,
        }
      : {},
  );
  return setup(config);
};

describe("useInitData - JWT authentication", () => {
  beforeEach(() => {
    setupEmbeddingSdkEnterprisePlugins();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should provide a helpful error if the user can't connect to their server for JWT", async () => {
    setupJwt({
      providerResponse: 500,
    });

    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-error-message",
      "Failed to fetch JWT token from http://test_uri/sso/metabase, status: 500.",
    );
  });

  it("should provide a helpful error if the user doesn't return the correct response from the fetchRefreshToken function", async () => {
    setupJwt(
      createMockSdkConfig({
        // @ts-expect-error we're testing behavior when users don't follow the type
        fetchRequestToken: (url) =>
          Promise.resolve(() => ({
            url,
          })),
      }),
    );

    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-error-message",
      "Your fetchRefreshToken function must return an object with the shape { jwt: string }",
    );
  });

  it("should provide a helpful error if the user doesn't return the correct payload from their JWT backend", async () => {
    setupJwt({
      providerResponse: { oisin: "is cool" },
    });

    expect(await screen.findByTestId("test-component")).toHaveAttribute(
      "data-error-message",
      'Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"oisin":"is cool"}',
    );
  });

  it("should send API requests with JWT token if initialization and login are successful", async () => {
    setupJwt();
    expect(await screen.findByTestId("test-component")).toBeInTheDocument();

    const lastCallRequest = fetchMock.callHistory.lastCall(
      "path:/api/user/current",
    )?.request;

    expect(lastCallRequest?.headers.get("X-Metabase-Session")).toEqual(
      "TEST_SESSION_TOKEN",
    );
  });

  it("should use a custom fetchRefreshToken function when specified", async () => {
    const fetchRequestToken = jest.fn(async () => ({
      jwt: "TEST_JWT_TOKEN",
    }));

    const { rerender } = setupJwt({ fetchRequestToken });

    expect(await screen.findByTestId("test-component")).toBeInTheDocument();
    expect(fetchRequestToken).toHaveBeenCalledTimes(1);

    const newFetchRequestToken = jest.fn(async () => ({
      jwt: "TEST_JWT_TOKEN",
    }));

    const authConfig = createMockSdkConfig({
      fetchRequestToken: newFetchRequestToken,
    });

    rerender(<TestComponent config={authConfig} />);
    await userEvent.click(screen.getByText("Refresh Token"));

    expect(newFetchRequestToken).toHaveBeenCalledTimes(1);
  });
});
