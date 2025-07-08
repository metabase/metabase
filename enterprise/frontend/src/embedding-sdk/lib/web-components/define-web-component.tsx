import type { ReactNode } from "react";

import { registerWebComponent } from "embedding-sdk/lib/web-components/register-web-component";
import type {
  WebComponentElementConstructor,
  WebComponentElements,
} from "embedding-sdk/types/web-components";
import type { ArrayOfUnion } from "metabase/embedding-sdk/types/utils";

import { r2wc } from "./r2wc";
import type { R2wcBaseProps, R2wcOptions } from "./r2wc/r2wc-core";
import type { R2wcPropTypes } from "./r2wc/types";

type CreateWebComponentConfig<
  TComponentProps,
  TComponentProperties,
  TContextProps,
  TChildrenElementNames extends string,
> = {
  propTypes: R2wcPropTypes<TComponentProps>;
  properties?: ArrayOfUnion<keyof TComponentProperties>;
  contextPropTypes?: R2wcPropTypes<TContextProps>;
  defineContext?: R2wcOptions<
    TComponentProps,
    TComponentProperties,
    TContextProps,
    TChildrenElementNames
  >["defineContext"];
};

export function defineWebComponent<
  TComponentProps,
  TComponentProperties = never,
  TContextProps = never,
  TChildrenElementNames extends string = string,
>(
  webComponentName: keyof WebComponentElements,
  component: (props: R2wcBaseProps & TComponentProps) => ReactNode,
  {
    propTypes,
    properties,
    contextPropTypes,
    defineContext,
  }: CreateWebComponentConfig<
    TComponentProps,
    TComponentProperties,
    TContextProps,
    TChildrenElementNames
  >,
): WebComponentElementConstructor {
  const webComponent = r2wc(component, {
    propTypes,
    properties,
    contextPropTypes,
    defineContext,
  });

  registerWebComponent(webComponentName, webComponent);

  return webComponent;
}
