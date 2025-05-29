import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  type MetabaseProviderProps,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk/components/public";

import {
  MOCK_INSTANCE_URL,
  MOCK_SESSION_TOKEN_ID,
  setupMockJwtEndpoints,
  setupMockSamlEndpoints,
  setupSamlPopup,
} from "../mocks/sso";

import { setup as baseSetup } from "./setup";

const setup = ({
  authConfig,
  locale,
}: Pick<MetabaseProviderProps, "authConfig" | "locale">) => {
  const popup = setupSamlPopup();
  setupMockSamlEndpoints();
  return {
    ...baseSetup({ authConfig, locale }),
    popup,
  };
};

describe("Auth Flow - SAML", () => {
  it("should initialize the auth flow only once, not on rerenders", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      preferredAuthMethod: "saml",
    });
    const { rerender, popup } = setup({ authConfig });
    await waitForLoaderToBeRemoved();
    expect(
      fetchMock.calls(`${MOCK_INSTANCE_URL}/auth/sso?saml=true`),
    ).toHaveLength(1);
    expect(popup.close).toHaveBeenCalled();
    rerender(
      <MetabaseProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );
    await waitForLoaderToBeRemoved();
    expect(
      fetchMock.calls(`${MOCK_INSTANCE_URL}/auth/sso?saml=true`),
    ).toHaveLength(1);
    expect(screen.queryByText("Initializing...")).not.toBeInTheDocument();
    expect(screen.getByTestId("query-visualization-root")).toBeInTheDocument();
  });

  it("should error if preferredAuthMethod is invalid", () => {
    expect(() =>
      defineMetabaseAuthConfig({
        metabaseInstanceUrl: MOCK_INSTANCE_URL,
        preferredAuthMethod: "invalid" as any,
      }),
    ).toThrow(/Invalid authentication method/);
  });

  it("should error if SAML is requested but only JWT is available", async () => {
    // Only setup JWT endpoints
    setupMockJwtEndpoints();
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
      preferredAuthMethod: "saml",
    });

    // Should fallback to error from backend
    setup({ authConfig });
    await waitForLoaderToBeRemoved();
    expect(
      screen.queryByTestId("query-visualization-root"),
    ).not.toBeInTheDocument();
  });

  it("should retrieve the session from the authProviderUri and send it as 'X-Metabase-Session' header", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
    });

    const { getLastCardQueryApiCall, getLastUserApiCall } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastUserApiCall());
    expect(getLastUserApiCall()![1]).toMatchObject({
      headers: { "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID] },
    });

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()![1]).toMatchObject({
      headers: { "X-Metabase-Session": [MOCK_SESSION_TOKEN_ID] },
    });
  });
});
