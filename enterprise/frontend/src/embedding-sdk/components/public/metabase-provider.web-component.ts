import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types/auth-config";

import { createMetabaseProviderWebComponent } from "../../lib/web-components/create-metabase-provider-web-component";

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithJwt["apiKey"];
};

const MetabaseProviderWebComponent = createMetabaseProviderWebComponent();
customElements.define("metabase-provider", MetabaseProviderWebComponent);
