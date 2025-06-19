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

import { propTypeTransformers } from "./prop-type-transformers/config";
import type {
  CustomPropTypeTransformersMap,
  PropTypes,
} from "./prop-type-transformers/types";

type MergedProps<TComponentProps> = R2WCBaseProps & {
  [key in keyof MetabaseProviderInternalProps]: string;
} & TComponentProps;

type CreateWebComponentConfig<TComponentProps> = {
  propTypes: PropTypes<TComponentProps>;
  propertyNames?: string[];
};

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { propTypes = {}, propertyNames }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const {
    renderer: { mount, update, unmount },
    propsStorage,
  } = getR2wcRenderer();
  const r2wcComponentPropTypes = Object.keys(propTypes).reduce((acc, _key) => {
    const key = _key as keyof PropTypes<TComponentProps>;
    const value = propTypes[key];

    if (!value) {
      return acc;
    }

    if (value in propTypeTransformers) {
      // we still have to keep the prop type in the object to allow r2wc handle it,
      // but we will apply our custom transformer on top of it
      acc[key] = "string";
    } else {
      acc[key] = value;
    }

    return acc;
  }, {} as PropTypes<TComponentProps>);

  const Constructor = r2wc(
    (props) => {
      const transformedProps = Object.keys(props).reduce((acc, _key) => {
        const key = _key as keyof MergedProps<TComponentProps> &
          keyof PropTypes<TComponentProps>;
        const value = props[key];

        const propType = propTypes[key];
        const transformer =
          propTypeTransformers[propType as keyof CustomPropTypeTransformersMap];

        if (!transformer) {
          acc[key] = value;
        } else {
          acc[key] = transformer(value as string) as (typeof acc)[typeof key];
        }

        return acc;
      }, {} as MergedProps<TComponentProps>);

      const { container, authConfig, theme, ...componentProps } =
        transformedProps;

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
        // Provider prop types
        authConfig: "string",
        theme: "string",

        // Component prop types
        ...r2wcComponentPropTypes,
      } as R2WCOptions<MergedProps<TComponentProps>>["props"],
    },
    { mount, update, unmount },
  );

  return withPropForwarding(Constructor, {
    propsStorage,
    propertyNames,
  });
};
