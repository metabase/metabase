import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { waitForLoaderToBeRemoved } from "__support__/ui";
import { waitForRequest } from "__support__/utils";
import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  MOCK_INSTANCE_URL,
  MOCK_SESSION_TOKEN_ID,
  setupMockSamlEndpoints,
  setupSamlPopup,
} from "embedding-sdk-bundle/test/mocks/sso";
import type { MetabaseProviderProps } from "embedding-sdk-bundle/types/metabase-provider";
import { defineMetabaseAuthConfig } from "embedding-sdk-shared/lib/define-metabase-auth-config";

import { setupEmbeddingSdkEnterprisePlugins } from "../support";

import { setup as baseSetup } from "./setup";

const setup = ({
  authConfig,
  locale,
}: Pick<MetabaseProviderProps, "authConfig" | "locale">) => {
  setupEmbeddingSdkEnterprisePlugins();
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
      <ComponentProvider authConfig={authConfig}>
        <StaticQuestion questionId={1} />
      </ComponentProvider>,
    );

    await waitForLoaderToBeRemoved();

    expect(
      fetchMock.callHistory.calls(`begin:${MOCK_INSTANCE_URL}/auth/sso`),
    ).toHaveLength(1);

    const loader = screen.queryByTestId("loading-indicator");
    expect(loader).not.toBeInTheDocument();

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
