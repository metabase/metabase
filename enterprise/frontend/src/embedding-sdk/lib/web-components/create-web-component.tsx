import type { ReactNode } from "react";

import {
  MetabaseProvider,
  type MetabaseProviderWebComponentContextProps,
} from "embedding-sdk";
import type { WebComponentElementConstructor } from "embedding-sdk/types/web-components";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

import { r2wc } from "./r2wc";
import type { R2wcBaseProps, R2wcOptions } from "./r2wc/r2wc-core";
import type { R2wcPropTypes } from "./r2wc/types";

type MergedProps<TComponentProps> = R2wcBaseProps &
  MetabaseProviderWebComponentContextProps &
  TComponentProps;

type CreateWebComponentConfig<TComponentProps, TContextProps> = {
  withProviders?: boolean;
  shadow?: "open" | null;
  propTypes: R2wcPropTypes<TComponentProps>;
  contextPropTypes: R2wcPropTypes<TContextProps>;
  defineContext?: R2wcOptions<TComponentProps, TContextProps>["defineContext"];
};

export const createWebComponent = <TComponentProps, TContextProps = never>(
  component: (props: TComponentProps) => ReactNode,
  {
    withProviders = true,
    shadow = "open",
    propTypes,
    contextPropTypes,
    defineContext,
  }: CreateWebComponentConfig<TComponentProps, TContextProps>,
): WebComponentElementConstructor => {
  const metabaseProviderPropTypes = {
    authConfig: "json",
    theme: "json",
  } as const;

  return r2wc(
    (props: MergedProps<TComponentProps>) => {
      const { container, authConfig, theme, ...componentProps } = props;

      const componentElement = component(componentProps as TComponentProps);

      if (!withProviders) {
        return componentElement;
      }

      if (!authConfig || !Object.keys(authConfig).length) {
        return null;
      }

      return (
        <ShadowRootProvider>
          <MetabaseProvider authConfig={authConfig} theme={theme}>
            {componentElement}
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      shadow: shadow ?? undefined,
      props: {
        ...metabaseProviderPropTypes,
        ...propTypes,
      },
      contextProps: contextPropTypes,
      defineContext,
    },
  );
};
