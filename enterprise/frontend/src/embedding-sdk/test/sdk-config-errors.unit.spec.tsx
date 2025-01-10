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
  defineMetabaseAuthConfig,
} from "embedding-sdk/components/public";
import type { MetabaseAuthConfig } from "embedding-sdk/types";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

const METABASE_INSTANCE_URL = "path:";
const AUTH_PROVIDER_URL = "http://auth-provider/metabase-sso";

const defaultAuthConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: METABASE_INSTANCE_URL,
  authProviderUri: AUTH_PROVIDER_URL,
});

const MOCK_CARD = createMockCard({ id: 1 });

const setup = async (config: MetabaseAuthConfig) => {
  render(
    <MetabaseProvider authConfig={config}>
      <StaticQuestion questionId={1} />
    </MetabaseProvider>,
  );
  await waitForLoaderToBeRemoved();
};

const mockAuthUriProviderResponse = (response: any) =>
  fetchMock.get(AUTH_PROVIDER_URL, response);
const getLastAuthProviderApiCall = () => fetchMock.lastCall(AUTH_PROVIDER_URL);

let consoleErrorSpy: jest.SpyInstance;

/**
 * Checks if the error message has been console.error'd and is visible on the page
 */
const expectErrorMessage = async (message: string) => {
  try {
    const errors = consoleErrorSpy.mock.calls.map(call => call[2]);
    const errorMessages = errors.map(error =>
      error instanceof Error ? error.message : error,
    );
    expect(errorMessages).toContainEqual(expect.stringContaining(message));
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

    consoleErrorSpy = jest
      .spyOn(console, "error")
      // Mock the implementation to avoid spamming the terminal as we do expect errors to be logged in these tests
      // Comment the next line to debug the tests
      .mockImplementation(() => {});
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe("Auth Provider URI authentication", () => {
    it("should show a message when the auth provider didn't return a json object", async () => {
      mockAuthUriProviderResponse({
        body: "not a json object",
      });

      await setup(defaultAuthConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());

      await expectErrorMessage(
        `The authProviderUri endpoint must return an object with the shape {id:string, exp:number, iat:number, status:string}, got "not a json object" instead`,
      );
    });

    it("should show a message when the auth provider returns the id as an object", async () => {
      mockAuthUriProviderResponse({
        body: { id: { id: "123" } },
      });

      await setup(defaultAuthConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());

      await expectErrorMessage(
        `The authProviderUri endpoint must return an object with the shape {id:string, exp:number, iat:number, status:string}, got`,
      );
    });

    it("should show a message when fetchRequestToken doesn't return a json object", async () => {
      const authConfig = defineMetabaseAuthConfig({
        ...defaultAuthConfig,
        // @ts-expect-error -- testing error path
        fetchRequestToken: async () => "not a json object",
      });

      await setup(authConfig);

      await expectErrorMessage(
        `The "fetchRequestToken" must return an object with the shape {id:string, exp:number, iat:number, status:string}, got "not a json object" instead`,
      );
    });

    it("should show a useful message if the authProviderUri returned an error code", async () => {
      mockAuthUriProviderResponse(
        JSON.stringify({ status: "error-embedding-sdk-disabled" }),
      );

      await setup(defaultAuthConfig);

      await waitForRequest(() => getLastAuthProviderApiCall());

      await expectErrorMessage("error-embedding-sdk-disabled");
    });

    it("if a custom `fetchRequestToken` throws an error, it should display it", async () => {
      const authConfig = defineMetabaseAuthConfig({
        ...defaultAuthConfig,
        fetchRequestToken: async () => {
          throw new Error("Custom error message");
        },
      });

      await setup(authConfig);

      await expectErrorMessage("Custom error message");
    });
  });
});
