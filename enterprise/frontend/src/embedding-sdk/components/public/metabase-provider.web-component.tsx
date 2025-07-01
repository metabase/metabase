import {
  createWebComponent,
  registerWebComponent,
} from "embedding-sdk/lib/web-components";
import type {
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
  MetabaseTheme,
} from "embedding-sdk/types";
import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types/auth-config";

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithApiKey["apiKey"];
};

export type MetabaseProviderWebComponentProps = {
  apiKey?: MetabaseAuthConfigWithJwt["apiKey"];
  metabaseInstanceUrl?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  fetchRequestToken?: MetabaseAuthConfigWithJwt["fetchRequestToken"];
  authConfig?: MetabaseAuthConfig;
  theme?: MetabaseTheme;
};

export type MetabaseProviderWebComponentContextProps = {
  authConfig: MetabaseAuthConfig;
  theme: MetabaseTheme;
};

const MetabaseProviderWebComponent = createWebComponent<
  MetabaseProviderWebComponentProps,
  MetabaseProviderWebComponentContextProps
>(() => null, {
  withProviders: false,
  shadow: null,
  propTypes: {
    metabaseInstanceUrl: "string",
    fetchRequestToken: "function",
    apiKey: "string",
    // These are passed as properties only, not as attributes
    authConfig: "noop",
    theme: "noop",
  },
  defineContext: {
    childrenComponents: [
      "interactive-question",
      "interactive-dashboard",
      "editable-dashboard",
      "collection-browser",
      "create-dashboard-modal",
      "metabot-question",
    ],
    provider: (instance) => ({
      authConfig: {
        metabaseInstanceUrl: instance.metabaseInstanceUrl,
        fetchRequestToken: instance.fetchRequestToken,
        apiKey: instance.apiKey,
        ...instance.authConfig,
      } as MetabaseAuthConfig,
      theme: instance.theme as MetabaseTheme,
    }),
  },
});

registerWebComponent("metabase-provider", MetabaseProviderWebComponent);
