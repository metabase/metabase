import type { R2WCBaseProps, R2WCOptions } from "@r2wc/core";
import r2wc from "@r2wc/core";
import type { ReactNode } from "react";

import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "embedding-sdk";
import {
  getR2wcRenderer,
  withPropForwarding,
} from "embedding-sdk/lib/web-components";
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
  propertyNames?: string[];
};

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { props, propertyNames }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const {
    renderer: { mount, update, unmount },
    propsStorage,
  } = getR2wcRenderer();

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
      shadow: "open",
      props: {
        // Provider props
        authConfig: "string",
        theme: "string",

        // Component props
        ...props,
      } as R2WCOptions<MergedProps<TComponentProps>>["props"],
    },
    { mount, update, unmount },
  );

  return withPropForwarding(Constructor, {
    propsStorage,
    propertyNames,
  });
};
