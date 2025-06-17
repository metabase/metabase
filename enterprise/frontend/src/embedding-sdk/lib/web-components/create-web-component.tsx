import type { R2WCBaseProps, R2WCOptions } from "@r2wc/core";
import r2wc from "@r2wc/react-to-web-component";
import type { ReactNode } from "react";

import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "embedding-sdk";
import { withInjectedStyles } from "embedding-sdk/lib/web-components";
import { AttributeSerializer } from "embedding-sdk/lib/web-components/attribute-serializer";
import type {
  MetabaseProviderInternalProps,
  WebComponentElementConstructor,
} from "embedding-sdk/types/web-components";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

type MergedProps<TComponentProps> = R2WCBaseProps & {
  [key in keyof MetabaseProviderInternalProps]: string;
} & TComponentProps;

type CreateWebComponentConfig<TComponentProps> = {
  props: Required<R2WCOptions<TComponentProps>["props"]>;
};

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { props }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const Constructor = r2wc(
    ({ container, authConfig, theme, ...componentProps }) => {
      if (!authConfig) {
        return;
      }

      return (
        <ShadowRootProvider>
          <MetabaseProvider
            authConfig={AttributeSerializer.deserializeAttributeValue<MetabaseAuthConfig>(
              authConfig,
            )}
            theme={AttributeSerializer.deserializeAttributeValue<
              MetabaseTheme | undefined
            >(theme)}
          >
            {component(componentProps as TComponentProps)}
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      shadow: "closed",
      props: {
        authConfig: "string",
        theme: "string",
        ...props,
      } as R2WCOptions<MergedProps<TComponentProps>>["props"],
    },
  );

  return withInjectedStyles(Constructor);
};
