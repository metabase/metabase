import { defineWebComponent } from "embedding-sdk/lib/web-components";
import type {
  ChildrenWebComponentElementNames,
  MetabaseAuthConfig,
  MetabaseAuthConfigWithApiKey,
  MetabaseTheme,
} from "embedding-sdk/types";
import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types/auth-config";

import { Slot } from "../private/Slot";

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithApiKey["apiKey"];
  locale?: string;
};

export type MetabaseProviderWebComponentProps = {
  apiKey?: MetabaseAuthConfigWithJwt["apiKey"];
  metabaseInstanceUrl?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  fetchRequestToken?: MetabaseAuthConfigWithJwt["fetchRequestToken"];
  locale?: string;
};

export type MetabaseProviderWebComponentContextProps = {
  authConfig: MetabaseAuthConfig;
  locale: string;
  theme: MetabaseTheme;
};

export const metabaseProviderContextProps = {
  // These are passed as properties only, not as attributes
  authConfig: "json",
  locale: "string",
  theme: "json",
} as const;

defineWebComponent<
  MetabaseProviderWebComponentProps,
  MetabaseProviderWebComponentContextProps,
  ChildrenWebComponentElementNames
>(
  "metabase-provider",
  ({ container, slot }) => <Slot container={container} slot={slot} />,
  {
    withProviders: false,
    propTypes: {
      metabaseInstanceUrl: "string",
      fetchRequestToken: "function",
      apiKey: "string",
      locale: "string",
    },
    contextPropTypes: metabaseProviderContextProps,
    defineContext: {
      childrenComponents: [
        "interactive-question",
        "static-question",
        "interactive-dashboard",
        "editable-dashboard",
        "static-dashboard",
        "collection-browser",
        "create-dashboard-modal",
        "metabot-question",
      ],
      provider: (instance) => ({
        authConfig: {
          ...{
            metabaseInstanceUrl: instance.metabaseInstanceUrl,
            fetchRequestToken: instance.fetchRequestToken,
            apiKey: instance.apiKey,
          },
          ...instance.authConfig,
        } as MetabaseAuthConfig,
        locale: instance.locale,
        theme: instance.theme as MetabaseTheme,
      }),
    },
  },
);
