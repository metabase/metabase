import { render, screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { waitForLoaderToBeRemoved } from "__support__/ui";
import type { SDKConfig } from "embedding-sdk";
import { MetabaseProvider, StaticDashboard } from "embedding-sdk";

const defaultJwtConfig: SDKConfig = {
  jwtProviderUri: "http://auth-provider/metabase-sso",
  metabaseInstanceUrl: "http://metabase-instance",
};

const setup = async (config: SDKConfig) => {
  render(
    <MetabaseProvider config={config}>
      <StaticDashboard dashboardId={1} />
    </MetabaseProvider>,
  );
  await waitForLoaderToBeRemoved();
};

const mockJwtProviderResponse = (response: any) =>
  fetchMock.get(defaultJwtConfig.jwtProviderUri, response);

const originalConsoleError = console.error;

let consoleErrorCalls: any[] = [];

/**
 * filters (in) the errors that contain the message in either the error or error.cause */
const errorsThatMatchMessage = (message: string) => {
  return consoleErrorCalls.filter(error => {
    return (
      error instanceof Error &&
      (error.toString().includes(message) ||
        error.cause?.toString().includes(message))
    );
  });
};

describe("SDK auth errors", () => {
  beforeEach(() => {
    console.error = jest.fn(error => {
      consoleErrorCalls.push(error);
    });
  });

  afterEach(() => {
    fetchMock.restore();
    consoleErrorCalls = [];
    console.error = originalConsoleError;
  });

  describe("jwt authentication", () => {
    //TODO: we need some refactor to actually do this as currently it fails on `response.json()`
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("should show a message when the JWT provider didn't return a json object", async () => {
      mockJwtProviderResponse({
        body: "not a json object",
        headers: { "Content-Type": "application/json" },
      });

      await setup(defaultJwtConfig);

      expect(
        screen.getByText("Received non-JSON response from JWT Provider URI"),
      ).toBeInTheDocument();
    });

    // TODO: currently not supported
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip("if a custom `fetchRequestToken` throws an error, it should display it", async () => {
      await setup({
        ...defaultJwtConfig,
        fetchRequestToken: async () => {
          throw new Error("Custom error message");
        },
      });

      expect(errorsThatMatchMessage("Custom error message")).toHaveLength(1);
    });

    it("should show a message when fetchRequestToken doesn't return a json object", async () => {
      await setup({
        ...defaultJwtConfig,
        // @ts-expect-error -- we're testing the error case
        fetchRequestToken: async () => "not a json object",
      });

      expect(
        screen.getByText("Received non-JSON response from JWT Provider URI"),
      ).toBeInTheDocument();
    });

    it("should show a useful message if the jwt provider returned an error code", async () => {
      mockJwtProviderResponse(
        JSON.stringify({ status: "error-embedding-sdk-disabled" }),
      );

      await setup(defaultJwtConfig);

      expect(
        screen.getByText("SDK Embedding is disabled."),
      ).toBeInTheDocument();
    });
  });
});
