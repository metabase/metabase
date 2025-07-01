import type { ReactNode } from "react";

import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "embedding-sdk";
import type {
  MetabaseProviderInternalProps,
  WebComponentElementConstructor,
} from "embedding-sdk/types/web-components";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

import { r2wc } from "./r2wc";
import type { R2wcBaseProps } from "./r2wc/r2wc-core";
import { jsonTransform } from "./r2wc/transforms/json";
import type { Transform } from "./r2wc/transforms/transforms";
import type { R2wcPropTypes } from "./r2wc/types";

type MergedProps<TComponentProps> = R2wcBaseProps &
  Record<keyof MetabaseProviderInternalProps, string> &
  TComponentProps;

type CreateWebComponentConfig<TComponentProps> = {
  propTypes: R2wcPropTypes<TComponentProps>;
};

const parse = <TValue,>(value: string) =>
  (jsonTransform as Transform<TValue>).parse(value);

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { propTypes }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const metabaseProviderPropTypes = {
    authConfig: "string",
    theme: "string",
  } as const;

  return r2wc(
    (props: MergedProps<TComponentProps>) => {
      const { container, authConfig, theme, ...componentProps } = props;

      if (!authConfig) {
        return;
      }

      return (
        <ShadowRootProvider>
          <MetabaseProvider
            authConfig={parse<MetabaseAuthConfig>(authConfig)}
            theme={parse<MetabaseTheme | undefined>(theme)}
          >
            {component(componentProps as TComponentProps)}
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      shadow: "open",
      props: {
        ...metabaseProviderPropTypes,
        ...propTypes,
      },
    },
  );
};
