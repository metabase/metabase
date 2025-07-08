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

export type MetabaseProviderWebComponentProperties = {
  authConfig: MetabaseAuthConfig;
  locale: string;
  theme: MetabaseTheme;
};

export type MetabaseProviderWebComponentContextProps = {
  metabaseProviderProps: MetabaseProviderWebComponentProperties;
};

export const metabaseProviderContextProps = {
  metabaseProviderProps: "json",
} as const;

defineWebComponent<
  MetabaseProviderWebComponentProps,
  MetabaseProviderWebComponentProperties,
  MetabaseProviderWebComponentContextProps,
  ChildrenWebComponentElementNames
>(
  "metabase-provider",
  ({ container, slot }) => <Slot container={container} slot={slot} />,
  {
    propTypes: {
      metabaseInstanceUrl: "string",
      fetchRequestToken: "function",
      apiKey: "string",
      locale: "string",
    },
    properties: ["authConfig", "locale", "theme"],
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
      provider: (instance, props) => {
        return {
          metabaseProviderProps: {
            authConfig: {
              ...{
                metabaseInstanceUrl: props.metabaseInstanceUrl,
                fetchRequestToken: props.fetchRequestToken,
                apiKey: props.apiKey,
              },
              ...instance.authConfig,
            } as MetabaseAuthConfig,
            locale: props.locale ?? instance.locale,
            theme: instance.theme as MetabaseTheme,
          },
        };
      },
    },
  },
);
