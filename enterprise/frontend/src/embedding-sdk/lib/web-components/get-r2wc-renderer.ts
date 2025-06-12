import { type ComponentType, createElement } from "react";
import { type Root, createRoot } from "react-dom/client";

interface Context<Props extends object> {
  root: Root;
  ReactComponent: ComponentType<Props>;
}

export function getR2wcRenderer() {
  const propsStorage: Record<string, unknown> = {};

  function mount<Props extends object>(
    container: HTMLElement,
    ReactComponent: ComponentType<Props>,
    props: Props,
  ): Context<Props> {
    const mergerProps = { ...props, ...propsStorage };
    const root = createRoot(container);

    const element = createElement(ReactComponent, mergerProps);
    root.render(element);

    return {
      root,
      ReactComponent,
    };
  }

  function update<Props extends object>(
    { root, ReactComponent }: Context<Props>,
    props: Props,
  ): void {
    const mergerProps = { ...props, ...propsStorage };

    const element = createElement(ReactComponent, mergerProps);
    root.render(element);
  }

  function unmount<Props extends object>({ root }: Context<Props>): void {
    root.unmount();
  }

  return {
    renderer: {
      unmount,
      mount,
      update,
    } as const,
    propsStorage,
  };
}
