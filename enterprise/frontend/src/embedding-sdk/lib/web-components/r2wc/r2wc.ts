import React, { type ComponentType } from "react";
import { createRoot } from "react-dom/client";

import {
  type R2wcBaseProps,
  type R2wcOptions,
  type R2wcRenderContext,
  r2wcCore,
} from "./r2wc-core";

function mount<TProps extends object>(
  container: ShadowRoot,
  ReactComponent: ComponentType<TProps>,
  props: TProps,
): R2wcRenderContext<TProps> {
  const root = createRoot(container);

  const element = React.createElement(ReactComponent, props);
  root.render(element);

  return {
    root,
    ReactComponent,
  };
}

function update<TProps extends object>(
  { root, ReactComponent }: R2wcRenderContext<TProps>,
  props: TProps,
): void {
  const element = React.createElement(ReactComponent, props);
  root.render(element);
}

function unmount<TProps extends object>({
  root,
}: R2wcRenderContext<TProps>): void {
  root.unmount();
}

export function r2wc<
  TProps extends R2wcBaseProps,
  TContextProps = never,
  TChildrenElementNames extends string = string,
>(
  ReactComponent: React.ComponentType<TProps>,
  options: R2wcOptions<TProps, TContextProps, TChildrenElementNames> = {},
): CustomElementConstructor {
  return r2wcCore<TProps, TContextProps>(ReactComponent, options, {
    mount,
    update,
    unmount,
  });
}
