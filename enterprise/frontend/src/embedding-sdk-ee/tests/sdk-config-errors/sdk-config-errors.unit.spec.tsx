import { render, screen, waitFor } from "@testing-library/react";

import {
  setupCardEndpoints,
  setupCardQueryEndpoints,
} from "__support__/server-mocks";
import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  type JwtMockConfig,
  MOCK_INSTANCE_URL,
  setupMockJwtEndpoints,
} from "embedding-sdk-bundle/test/mocks/sso";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import { defineMetabaseAuthConfig } from "embedding-sdk-shared/lib/define-metabase-auth-config";
import { createMockCard } from "metabase-types/api/mocks";

import { setupEmbeddingSdkEnterprisePlugins } from "../support";

const defaultAuthConfig = defineMetabaseAuthConfig({
  metabaseInstanceUrl: MOCK_INSTANCE_URL,
});

const MOCK_CARD = createMockCard({ id: 1 });

const setup = async (
  config: MetabaseAuthConfig,
  jwtProviderResponse?: JwtMockConfig["providerResponse"],
) => {
  setupEmbeddingSdkEnterprisePlugins();

  const { jwtProviderMock } = setupMockJwtEndpoints({
    providerResponse: jwtProviderResponse,
  });

  setupSdkState();

  setupCardEndpoints(MOCK_CARD);
  setupCardQueryEndpoints(MOCK_CARD, {} as any);

  consoleErrorSpy = jest
    .spyOn(console, "error")
    // Mock the implementation to avoid spamming the terminal as we do expect errors to be logged in these tests
    // Comment the next line to debug the tests
    .mockImplementation(() => {});

  render(
    <ComponentProvider authConfig={config}>
      <StaticQuestion questionId={1} />
    </ComponentProvider>,
  );

  await waitForLoaderToBeRemoved();

  const getLastAuthProviderApiCall = () =>
    jwtProviderMock.callHistory.lastCall();

  return { getLastAuthProviderApiCall };
};

let consoleErrorSpy: jest.SpyInstance;

/**
 * Checks if the error message has been console.error'd and is visible on the page
 */
const expectErrorMessage = async (message: string) => {
  try {
    const errors = consoleErrorSpy.mock.calls.map((call) => call[0]);
    const errorMessages = errors.map((error) =>
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

describe("SDK auth errors for JWT authentication", () => {
  it("should show a message when the user's JWT server endpoint doesn't return a json object", async () => {
    const { getLastAuthProviderApiCall } = await setup(defaultAuthConfig, {
      body: "not a json object",
    });

    await waitForRequest(() => getLastAuthProviderApiCall());

    await expectErrorMessage(
      'Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received "not a json object"',
    );
  });

  it("should show a message when the auth provider returns the id as an object", async () => {
    const { getLastAuthProviderApiCall } = await setup(defaultAuthConfig, {
      body: { id: { id: "123" } },
    });

    await waitForRequest(() => getLastAuthProviderApiCall());

    await expectErrorMessage(
      'Your JWT server endpoint must return an object with the shape { jwt: string }, but instead received {"id":{"id":"123"}}',
    );
  });

  it("should show a message when fetchRequestToken doesn't return a json object", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      // @ts-expect-error -- testing error path
      fetchRequestToken: async () => "not a json object",
    });

    await setup(authConfig);

    await expectErrorMessage(
      'Your fetchRefreshToken function must return an object with the shape { jwt: string }, but instead received "not a json object"',
    );
  });

  it("should show a useful message if the JWT provider URI returns an error code", async () => {
    const { getLastAuthProviderApiCall } = await setup(defaultAuthConfig, {
      body: JSON.stringify({ status: "error-embedding-sdk-disabled" }),
    });

    await waitForRequest(() => getLastAuthProviderApiCall());

    await expectErrorMessage("error-embedding-sdk-disabled");
  });

  it("if a custom `fetchRequestToken` throws an error, it should display it", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      fetchRequestToken: async () => {
        throw new Error("Custom error message");
      },
    });

    await setup(authConfig);

    await expectErrorMessage("Custom error message");
  });
});
