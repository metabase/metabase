import { registerWebComponent } from "embedding-sdk/lib/web-components";
import { withPropForwarding } from "embedding-sdk/lib/web-components/with-prop-forwarding";
import type { MetabaseProviderInternalProps } from "embedding-sdk/types";
import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types/auth-config";

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithJwt["apiKey"];
};

const MetabaseProviderWebComponent =
  withPropForwarding<MetabaseProviderInternalProps>(HTMLElement, {
    childrenComponents: [
      "interactive-question",
      "interactive-dashboard",
      "editable-dashboard",
      "collection-browser",
    ],
    propertyNames: ["authConfig", "theme"],
    propMappings: [
      {
        attributeName: "metabase-instance-url",
        key: "metabaseInstanceUrl",
        parent: "authConfig",
      },
      { attributeName: "api-key", key: "apiKey", parent: "authConfig" },
      {
        attributeName: "fetch-request-token",
        key: "fetchRequestToken",
        parent: "authConfig",
      },
    ],
  });
registerWebComponent("metabase-provider", MetabaseProviderWebComponent);
