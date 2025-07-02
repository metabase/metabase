import type { ComponentType } from "react";
import type { Root } from "react-dom/client";

import { noopTransform } from "embedding-sdk/lib/web-components/r2wc/transforms/noop";

import { toDashedCase } from "../../string";

import { transforms } from "./transforms/transforms";
import type { R2wcPropTransformType } from "./types";

type PropName<TProps> = Exclude<Extract<keyof TProps, string>, "container">;
type PropNames<TProps> = Array<PropName<TProps>>;

export interface R2wcOptions<TProps, TContextProps = never> {
  shadow?: "open" | "closed";
  props?:
    | PropNames<TProps>
    | Partial<Record<PropName<TProps>, R2wcPropTransformType>>;
  contextProps?: Partial<
    Record<PropName<TContextProps>, R2wcPropTransformType>
  >;
  events?: PropNames<TProps> | Partial<Record<PropName<TProps>, EventInit>>;
  defineContext?: {
    childrenComponents: string[];
    provider: (instance: HTMLElement & TProps & TContextProps) => TContextProps;
  };
}

export interface R2wcRenderContext<TProps> {
  root: Root;
  ReactComponent: ComponentType<TProps>;
}

export interface R2wcRenderer<TProps> {
  mount: (
    container: HTMLElement,
    ReactComponent: ComponentType<TProps>,
    props: TProps,
  ) => R2wcRenderContext<TProps>;
  update: (context: R2wcRenderContext<TProps>, props: TProps) => void;
  unmount: (context: R2wcRenderContext<TProps>) => void;
}

export interface R2wcBaseProps {
  container?: HTMLElement;
}

const renderSymbol = Symbol.for("r2wc.render");
const connectedSymbol = Symbol.for("r2wc.connected");
const contextSymbol = Symbol.for("r2wc.context");
const propsSymbol = Symbol.for("r2wc.props");
const provideContextToChildrenSymbol = Symbol.for(
  "r2wc.provideContextToChildrenSymbol",
);

export function r2wcCore<TProps extends R2wcBaseProps, TContextProps>(
  ReactComponent: ComponentType<TProps>,
  options: R2wcOptions<TProps, TContextProps>,
  renderer: R2wcRenderer<TProps>,
): CustomElementConstructor {
  if (!options.props) {
    options.props = ReactComponent.propTypes
      ? (Object.keys(ReactComponent.propTypes) as PropNames<TProps>)
      : [];
  }
  if (!options.events) {
    options.events = [];
  }

  const propNames = Array.isArray(options.props)
    ? options.props.slice()
    : (Object.keys(options.props) as PropNames<TProps>);
  const contextPropNames = Object.keys(
    options.contextProps ?? {},
  ) as PropNames<TContextProps>;

  const eventNames = Array.isArray(options.events)
    ? options.events.slice()
    : (Object.keys(options.events) as PropNames<TProps>);

  const propTypes = {} as Partial<
    Record<PropName<TProps>, R2wcPropTransformType>
  >;
  const eventParams = {} as Partial<Record<PropName<TProps>, EventInit>>;
  const mapPropAttribute = {} as Record<PropName<TProps>, string>;
  const mapAttributeProp = {} as Record<string, PropName<TProps>>;

  for (const prop of propNames) {
    propTypes[prop] = Array.isArray(options.props)
      ? "string"
      : options.props[prop];

    const attribute = toDashedCase(prop);

    mapPropAttribute[prop] = attribute;
    mapAttributeProp[attribute] = prop;
  }

  for (const event of eventNames) {
    eventParams[event] = Array.isArray(options.events)
      ? {}
      : options.events[event];
  }

  class ReactWebComponent extends HTMLElement {
    static get observedAttributes() {
      return Object.keys(mapAttributeProp);
    }

    [connectedSymbol] = true;
    [contextSymbol]?: R2wcRenderContext<TProps>;
    [propsSymbol]: TProps = {} as TProps;
    container: HTMLElement;

    constructor() {
      super();

      if (options.shadow) {
        this.container = this.attachShadow({
          mode: options.shadow,
        }) as unknown as HTMLElement;
      } else {
        this.container = document.createElement("div");
      }

      this[propsSymbol].container = this.container;

      for (const prop of propNames) {
        const attribute = mapPropAttribute[prop];
        const value = this.getAttribute(attribute);
        const type = propTypes[prop];
        const transform = type ? transforms[type] : null;

        if (transform?.parse && value) {
          // @ts-expect-error dynamic key
          this[propsSymbol][prop] = transform.parse(value);
        }
      }
      for (const event of eventNames) {
        // @ts-expect-error dynamic key
        this[propsSymbol][event] = (detail) => {
          const name = event.replace(/^on/, "").toLowerCase();
          this.dispatchEvent(
            new CustomEvent(name, { detail, ...eventParams[event] }),
          );
        };
      }
    }

    connectedCallback() {
      this[connectedSymbol] = true;
      this[renderSymbol]();
    }

    disconnectedCallback() {
      this[connectedSymbol] = false;

      if (this[contextSymbol]) {
        renderer.unmount(this[contextSymbol]);
      }
      delete this[contextSymbol];
    }

    attributeChangedCallback(
      attribute: string,
      oldValue: string,
      value: string,
    ) {
      const prop = mapAttributeProp[attribute];
      const type = propTypes[prop];
      const transform = type ? transforms[type] : null;

      if (
        prop in propTypes &&
        transform &&
        transform !== noopTransform &&
        value
      ) {
        // @ts-expect-error dynamic key
        this[propsSymbol][prop] = transform.parse(value, attribute, this);

        this[renderSymbol]();
      }
    }

    [renderSymbol]() {
      if (!this[connectedSymbol]) {
        return;
      }

      if (!this[contextSymbol]) {
        this[contextSymbol] = renderer.mount(
          this.container,
          ReactComponent,
          this[propsSymbol],
        );
      } else {
        renderer.update(this[contextSymbol], this[propsSymbol]);
      }

      this[provideContextToChildrenSymbol]();
    }

    [provideContextToChildrenSymbol]() {
      const { defineContext } = options;

      const childrenComponents = defineContext?.childrenComponents ?? [];

      if (!defineContext || !childrenComponents.length) {
        return;
      }

      const { provider } = defineContext;

      const childrenSelector = childrenComponents.join(",");
      const children = this.querySelectorAll<HTMLElement>(childrenSelector);

      // @ts-expect-error `this` typecast
      const contextProps = provider(this);

      if (!contextProps) {
        return;
      }

      // Pass the context props to all observed children
      Object.keys(contextProps).forEach((prop) => {
        // @ts-expect-error dynamic key
        const rawValue = contextProps[prop];

        const type =
          options.contextProps?.[prop as keyof typeof options.contextProps];
        const transform = type ? transforms[type] : null;

        if (transform && transform !== noopTransform) {
          // @ts-expect-error dynamic value
          const value = transform.stringify(rawValue);

          if (value === undefined) {
            return;
          }

          const attributeName = toDashedCase(prop.toString());

          children.forEach((child) => {
            child.setAttribute(attributeName, value);
          });
        }
      });
    }
  }

  // Define getters/setters for regular props
  for (const prop of propNames) {
    const attribute = mapPropAttribute[prop];
    const type = propTypes[prop];

    Object.defineProperty(ReactWebComponent.prototype, prop, {
      enumerable: true,
      configurable: true,
      get() {
        return this[propsSymbol][prop];
      },
      set(value) {
        this[propsSymbol][prop] = value;

        const transform = type ? transforms[type] : null;

        if (transform && transform !== noopTransform) {
          // @ts-expect-error dynamic key
          const attributeValue = transform.stringify(value);
          const oldAttributeValue = this.getAttribute(attribute);

          if (oldAttributeValue !== attributeValue) {
            this.setAttribute(attribute, attributeValue);
          }
        } else {
          this[renderSymbol]();
        }
      },
    });
  }

  // Define getters/setters for context props
  for (const contextProp of contextPropNames) {
    Object.defineProperty(ReactWebComponent.prototype, contextProp, {
      enumerable: true,
      configurable: true,
      get() {
        return this[propsSymbol][contextProp];
      },
      set(value) {
        this[propsSymbol][contextProp] = value;
        this[renderSymbol]();
      },
    });
  }

  return ReactWebComponent;
}
