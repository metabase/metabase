import type { R2WCBaseProps } from "@r2wc/core";
import r2wc from "@r2wc/react-to-web-component";
import { type ReactNode, useMemo } from "react";

import {
  type MetabaseAuthConfig,
  MetabaseProvider,
  type MetabaseTheme,
} from "embedding-sdk";
import { AttributeSerializer } from "embedding-sdk/lib/web-components/attribute-serializer";
import type {
  MetabaseProviderInternalProps,
  WebComponentElementConstructor,
} from "embedding-sdk/types/web-components";
import { ShadowRootProvider } from "metabase/embedding-sdk/components";

import { propTypeTransformers } from "./prop-type-transformers/config";
import type {
  CustomPropTypeTransformersMap,
  PropTypeTransformersMap,
  PropTypes,
  R2wcDefaultTransformersMap,
  R2wcPropTypes,
} from "./prop-type-transformers/types";

type MergedProps<TComponentProps> = R2WCBaseProps &
  Record<keyof MetabaseProviderInternalProps, string> &
  TComponentProps;

type CreateWebComponentConfig<TComponentProps> = {
  propTypes: PropTypes<TComponentProps>;
};

const transformProps = <TComponentProps,>(
  props: MergedProps<TComponentProps>,
  propTypes: PropTypes<TComponentProps>,
) =>
  Object.keys(props).reduce((acc, _key) => {
    const key = _key as keyof TComponentProps;
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

const isR2wcPropType = (
  value: keyof PropTypeTransformersMap,
): value is keyof R2wcDefaultTransformersMap =>
  !(value in propTypeTransformers);

const getCreatedWebComponentPropTypes = <TComponentProps,>(
  propTypes: PropTypes<TComponentProps>,
) =>
  Object.keys(propTypes).reduce((acc, _key) => {
    const key = _key as keyof TComponentProps;
    const value = propTypes[key];

    if (!value) {
      return acc;
    }

    acc[key] = isR2wcPropType(value) ? value : "string";

    return acc;
  }, {} as R2wcPropTypes<TComponentProps>);

export const createWebComponent = <TComponentProps,>(
  component: (props: TComponentProps) => ReactNode,
  { propTypes }: CreateWebComponentConfig<TComponentProps>,
): WebComponentElementConstructor => {
  const metabaseProviderPropTypes = {
    authConfig: "string",
    theme: "string",
  } as const;
  const createdWebComponentPropTypes =
    getCreatedWebComponentPropTypes(propTypes);

  return r2wc(
    (props: MergedProps<TComponentProps>) => {
      const transformedProps = useMemo(
        () => transformProps(props, propTypes),
        [props],
      );

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
        ...metabaseProviderPropTypes,
        ...createdWebComponentPropTypes,
      },
    },
  );
};
