import type { R2WCBaseProps, R2WCOptions } from "@r2wc/core";
import r2wc from "@r2wc/react-to-web-component";
import type { ReactNode } from "react";

import {
  type MetabaseAuthConfigWithJwt,
  MetabaseProvider,
} from "embedding-sdk";
import { withInjectedStyles } from "embedding-sdk/lib/web-components";
import type { WebComponentElementConstructor } from "embedding-sdk/types";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

type MetabaseProviderInternalProps = Required<
  Pick<
    MetabaseAuthConfigWithJwt,
    "metabaseInstanceUrl" | "apiKey" | "fetchRequestToken"
  >
>;

type MergedProps<TComponentProps> = R2WCBaseProps &
  MetabaseProviderInternalProps &
  TComponentProps;

type CreateWebComponentConfig<TComponentProps> = {
  props: Required<R2WCOptions<TComponentProps>["props"]>;
};

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { props }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const Constructor = r2wc(
    ({
      container,
      metabaseInstanceUrl,
      apiKey,
      fetchRequestToken,
      ...componentProps
    }) => {
      return (
        <ShadowRootProvider>
          <MetabaseProvider
            authConfig={{
              metabaseInstanceUrl,
              apiKey,
              fetchRequestToken,
            }}
          >
            {component(componentProps as TComponentProps)}
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      shadow: "closed",
      props: {
        metabaseInstanceUrl: "string",
        apiKey: "string",
        fetchRequestToken: "function",
        ...props,
      } as R2WCOptions<MergedProps<TComponentProps>>["props"],
    },
  );

  return withInjectedStyles(Constructor);
};
