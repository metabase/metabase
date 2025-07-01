import { toDashedCase } from "../../string";

import { transforms } from "./transforms/transforms";
import type { R2wcPropTransformType } from "./types";

type PropName<Props> = Exclude<Extract<keyof Props, string>, "container">;
type PropNames<Props> = Array<PropName<Props>>;

export interface R2wcOptions<Props> {
  shadow?: "open" | "closed";
  props?:
    | PropNames<Props>
    | Partial<Record<PropName<Props>, R2wcPropTransformType>>;
  events?: PropNames<Props> | Partial<Record<PropName<Props>, EventInit>>;
}

export interface R2wcRenderer<Props, Context> {
  mount: (
    container: HTMLElement,
    ReactComponent: React.ComponentType<Props>,
    props: Props,
  ) => Context;
  update: (context: Context, props: Props) => void;
  unmount: (context: Context) => void;
}

export interface R2wcBaseProps {
  container?: HTMLElement;
}

const renderSymbol = Symbol.for("r2wc.render");
const connectedSymbol = Symbol.for("r2wc.connected");
const contextSymbol = Symbol.for("r2wc.context");
const propsSymbol = Symbol.for("r2wc.props");

export function r2wcCore<Props extends R2wcBaseProps, Context>(
  ReactComponent: React.ComponentType<Props>,
  options: R2wcOptions<Props>,
  renderer: R2wcRenderer<Props, Context>,
): CustomElementConstructor {
  if (!options.props) {
    options.props = ReactComponent.propTypes
      ? (Object.keys(ReactComponent.propTypes) as PropNames<Props>)
      : [];
  }
  if (!options.events) {
    options.events = [];
  }

  const propNames = Array.isArray(options.props)
    ? options.props.slice()
    : (Object.keys(options.props) as PropNames<Props>);
  const eventNames = Array.isArray(options.events)
    ? options.events.slice()
    : (Object.keys(options.events) as PropNames<Props>);

  const propTypes = {} as Partial<
    Record<PropName<Props>, R2wcPropTransformType>
  >;
  const eventParams = {} as Partial<Record<PropName<Props>, EventInit>>;
  const mapPropAttribute = {} as Record<PropName<Props>, string>;
  const mapAttributeProp = {} as Record<string, PropName<Props>>;

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
    [contextSymbol]?: Context;
    [propsSymbol]: Props = {} as Props;
    container: HTMLElement;

    constructor() {
      super();

      if (options.shadow) {
        this.container = this.attachShadow({
          mode: options.shadow,
        }) as unknown as HTMLElement;
      } else {
        this.container = this;
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

      if (prop in propTypes && transform?.parse && value) {
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
    }
  }

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

        if (transform) {
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

  return ReactWebComponent;
}
