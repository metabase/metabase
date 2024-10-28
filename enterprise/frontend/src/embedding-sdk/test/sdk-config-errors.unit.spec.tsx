/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["expect", "expectErrorMessage"] }] */

import { render, screen, waitFor } from "@testing-library/react";
import fetchMock from "fetch-mock";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupCurrentUserEndpoint,
  setupPropertiesEndpoints,
} from "__support__/server-mocks";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  StaticQuestion,
  defineEmbeddingSdkConfig,
} from "embedding-sdk/components/public";
import type { SDKConfig } from "embedding-sdk/types";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const METABASE_INSTANCE_URL = "path:";
const AUTH_PROVIDER_URL = "http://auth-provider/metabase-sso";

const defaultJwtConfig = defineEmbeddingSdkConfig({
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  jwtProviderUri: AUTH_PROVIDER_URL,
});

const MOCK_CARD = createMockCard({ id: 1 });

const setup = async (config: SDKConfig) => {
  render(
    <MetabaseProvider config={config}>
      <StaticQuestion questionId={1} />
    </MetabaseProvider>,
  );
  await waitForLoaderToBeRemoved();
};

const mockJwtProviderResponse = (response: any) =>
  fetchMock.get(AUTH_PROVIDER_URL, response);
const getLastAuthProviderApiCall = () => fetchMock.lastCall(AUTH_PROVIDER_URL);
const originalConsoleError = console.error;

// Will store the args of the console.error calls
let consoleErrorCalls: any[][] = [];
const errorsThatIncludeMessage = (message: string) => {
  return consoleErrorCalls.filter(args =>
    args.some((arg: any) => {
      return (
        arg instanceof Error &&
        (arg.toString().includes(message) ||
          arg.cause?.toString().includes(message))
      );
    }),
  );
};

/**
 * Checks if the error message has been console.error'd. and is visible on the page
 */
const expectErrorMessage = async (message: string) => {
  try {
    expect(errorsThatIncludeMessage(message)).toHaveLength(1);
    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(message, "i"), { exact: false }),
      ).toBeInTheDocument();
    });
  } catch (error) {
    Error.captureStackTrace(error as Error, expectErrorMessage);
    throw error;
  }
};

describe("SDK auth errors", () => {
  beforeEach(() => {
    fetchMock.reset();

    setupPropertiesEndpoints(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          embedding_sdk: true,
        }),
      }),
    );
    setupCurrentUserEndpoint(createMockUser({ id: 1 }));

    setupCardEndpoints(MOCK_CARD);
    setupCardQueryEndpoints(MOCK_CARD, {} as any);

    console.error = jest.fn((...args) => {
      consoleErrorCalls.push(args);
      // Uncomment to line below to debug these tests
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    consoleErrorCalls = [];
    console.error = originalConsoleError;
  });

  describe("jwt authentication", () => {
    it("should show a message when the JWT provider didn't return a json object", async () => {
      mockJwtProviderResponse({
        body: "not a json object",
      });

      await setup(defaultJwtConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());

      await expectErrorMessage(
        `The jwtProvider endpoint must return an object with the shape {id:string, exp:number, iat:number, status:string}, got "not a json object" instead`,
      );
    });

    it("should show a message when fetchRequestToken doesn't return a json object", async () => {
      const config = defineEmbeddingSdkConfig({
        ...defaultJwtConfig,
        // @ts-expect-error -- testing error path
        fetchRequestToken: async () => "not a json object",
      });

      await setup(config);

      await expectErrorMessage(
        `The "fetchRequestToken" must return an object with the shape {id:string, exp:number, iat:number, status:string}, got "not a json object" instead`,
      );
    });

    it("should show a useful message if the jwt provider returned an error code", async () => {
      mockJwtProviderResponse(
        JSON.stringify({ status: "error-embedding-sdk-disabled" }),
      );

      await setup(defaultJwtConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());

      expect(
        errorsThatIncludeMessage("error-embedding-sdk-disabled"),
      ).toHaveLength(1);
    });

    it("if a custom `fetchRequestToken` throws an error, it should display it", async () => {
      const config = defineEmbeddingSdkConfig({
        ...defaultJwtConfig,
        fetchRequestToken: async () => {
          throw new Error("Custom error message");
        },
      });

      await setup(config);

      expect(errorsThatIncludeMessage("Custom error message")).toHaveLength(1);
    });
  });
});
