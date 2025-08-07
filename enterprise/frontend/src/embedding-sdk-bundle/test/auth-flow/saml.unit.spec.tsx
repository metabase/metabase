import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import {
  MetabaseProvider,
  type MetabaseProviderProps,
  StaticQuestion,
  defineMetabaseAuthConfig,
} from "embedding-sdk-bundle/components/public";

import {
  MOCK_INSTANCE_URL,
  MOCK_SESSION_TOKEN_ID,
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
    });

    const { rerender, popup } = setup({ authConfig });

    await waitForLoaderToBeRemoved();
    expect(
      fetchMock.callHistory.calls(`begin:${MOCK_INSTANCE_URL}/auth/sso`),
    ).toHaveLength(1);
    expect(popup.close).toHaveBeenCalled();

    rerender(
      <MetabaseProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </MetabaseProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(
      fetchMock.callHistory.calls(`begin:${MOCK_INSTANCE_URL}/auth/sso`),
    ).toHaveLength(1);

    expect(screen.queryByText("Initializing...")).not.toBeInTheDocument();

    expect(
      // this is just something we know it's on the screen when everything is ok
      screen.getByTestId("query-visualization-root"),
    ).toBeInTheDocument();
  });

  it("should retrieve the session from the authProviderUri and send it as 'X-Metabase-Session' header", async () => {
    const authConfig = defineMetabaseAuthConfig({
      metabaseInstanceUrl: MOCK_INSTANCE_URL,
    });

    const { getLastCardQueryApiCall, getLastUserApiCall } = setup({
      authConfig,
    });

    await waitForRequest(() => getLastUserApiCall());
    expect(getLastUserApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );

    await waitForRequest(() => getLastCardQueryApiCall());
    expect(getLastCardQueryApiCall()?.options.headers).toHaveProperty(
      "x-metabase-session",
      MOCK_SESSION_TOKEN_ID,
    );
  });
});
