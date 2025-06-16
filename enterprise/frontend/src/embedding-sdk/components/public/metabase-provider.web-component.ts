import {
  createMetabaseProviderWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";
import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types/auth-config";

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithJwt["apiKey"];
};

const MetabaseProviderWebComponent = createMetabaseProviderWebComponent();
registerWebComponent("metabase-provider", MetabaseProviderWebComponent);
