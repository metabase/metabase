import type { ReactNode } from "react";

import { MetabaseProvider } from "embedding-sdk/components/public/MetabaseProvider";
import {
  type MetabaseProviderWebComponentContextProps,
  metabaseProviderContextProps,
} from "embedding-sdk/components/public/metabase-provider.web-component";
import { registerWebComponent } from "embedding-sdk/lib/web-components/register-web-component";
import type {
  WebComponentElementConstructor,
  WebComponentElements,
} from "embedding-sdk/types/web-components";
import { ShadowRootProvider } from "metabase/embedding-sdk/components/ShadowRootProvider";

import { r2wc } from "./r2wc";
import type { R2wcBaseProps, R2wcOptions } from "./r2wc/r2wc-core";
import type { R2wcPropTypes } from "./r2wc/types";

type MergedProps<TComponentProps> = R2wcBaseProps &
  MetabaseProviderWebComponentContextProps &
  TComponentProps;

type CreateWebComponentConfig<
  TComponentProps,
  TContextProps,
  TChildrenElementNames extends string,
> = {
  withProviders?: boolean;
  propTypes: R2wcPropTypes<TComponentProps>;
  contextPropTypes?: R2wcPropTypes<TContextProps>;
  defineContext?: R2wcOptions<
    TComponentProps,
    TContextProps,
    TChildrenElementNames
  >["defineContext"];
};

export function defineWebComponent<
  TComponentProps,
  TContextProps = never,
  TChildrenElementNames extends string = string,
>(
  webComponentName: keyof WebComponentElements,
  component: (props: R2wcBaseProps & TComponentProps) => ReactNode,
  {
    withProviders = true,
    propTypes,
    contextPropTypes,
    defineContext,
  }: CreateWebComponentConfig<
    TComponentProps,
    TContextProps,
    TChildrenElementNames
  >,
): WebComponentElementConstructor {
  const webComponent = r2wc(
    (props: MergedProps<TComponentProps>) => {
      const { authConfig, locale, theme, ...componentProps } = props;

      const componentElement = component(
        componentProps as R2wcBaseProps & TComponentProps,
      );

      if (!withProviders) {
        return componentElement;
      }

      if (!authConfig || !Object.keys(authConfig).length) {
        return null;
      }

      if (!ShadowRootProvider || !MetabaseProvider) {
        return null;
      }

      return (
        <ShadowRootProvider>
          <MetabaseProvider
            authConfig={authConfig}
            locale={locale}
            theme={theme}
          >
            {componentElement}
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      props: {
        ...metabaseProviderContextProps,
        ...propTypes,
      },
      contextProps: contextPropTypes,
      defineContext,
    },
  );

  registerWebComponent(webComponentName, webComponent);

  return webComponent;
}
