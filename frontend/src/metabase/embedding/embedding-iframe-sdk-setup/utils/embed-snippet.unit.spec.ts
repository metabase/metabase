import type { SdkIframeEmbedSetupSettings } from "metabase/embedding/embedding-iframe-sdk-setup/types";

import { getMetabaseConfigSnippet } from "./embed-snippet";

describe("getMetabaseConfigSnippet", () => {
  it("only includes the instanceUrl for an SSO embed", () => {
    const settings: SdkIframeEmbedSetupSettings = {
      componentName: "metabase-dashboard",
      dashboardId: 1,
      isGuest: false,
      useExistingUserSession: false,
    };

    const config = JSON.parse(
      `{${getMetabaseConfigSnippet({
        settings,
        instanceUrl: "https://metabase.example.com",
      })}}`,
    );

    expect(config).toStrictEqual({
      instanceUrl: "https://metabase.example.com",
    });
  });
});
