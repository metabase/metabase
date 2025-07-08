import type { ComponentType } from "react";
import type { Root } from "react-dom/client";

import type { ArrayOfUnion } from "metabase/embedding-sdk/types/utils";
import { uuid } from "metabase/lib/uuid";

import { toDashedCase } from "../../../lib/string";

import { noopTransform } from "./transforms/noop";
import { transforms } from "./transforms/transforms";
import type { R2wcPropTransformType } from "./types";

type PropName<TProps> = Exclude<
  Extract<keyof TProps, string>,
  "container" | "childrenNodes" | "slot"
>;
type PropNames<TProps> = Array<PropName<TProps>>;

export interface R2wcOptions<
  TProps,
  TProperties = never,
  TContextProps = never,
  TChildrenElementNames extends string = string,
> {
  propTypes?:
    | PropNames<TProps>
    | Partial<Record<PropName<TProps>, R2wcPropTransformType>>;
  properties?: ArrayOfUnion<keyof TProperties>;
  contextPropTypes?: Partial<
    Record<PropName<TContextProps>, R2wcPropTransformType>
  >;
  events?: PropNames<TProps> | Partial<Record<PropName<TProps>, EventInit>>;
  defineContext?: {
    childrenComponents: ArrayOfUnion<TChildrenElementNames>;
    provider: (
      instance: HTMLElement & TProperties,
      props: TProps,
    ) => TContextProps;
  };
}

export interface R2wcRenderContext<TProps> {
  root: Root;
  ReactComponent: ComponentType<TProps>;
}

export interface R2wcRenderer<TProps> {
  mount: (
    container: ShadowRoot,
    ReactComponent: ComponentType<TProps>,
    props: TProps,
  ) => R2wcRenderContext<TProps>;
  update: (context: R2wcRenderContext<TProps>, props: TProps) => void;
  unmount: (context: R2wcRenderContext<TProps>) => void;
}

export interface R2wcBaseProps {
  container: ShadowRoot;
  slot: string;
}

const renderSymbol = Symbol.for("r2wc.render");
const connectedSymbol = Symbol.for("r2wc.connected");
const contextSymbol = Symbol.for("r2wc.context");
const propsSymbol = Symbol.for("r2wc.props");
const observerSymbol = Symbol.for("r2wc.observer");
const shadowRootSymbol = Symbol.for("r2wc.shadowRoot");
const childrenNodesSymbol = Symbol.for("r2wc.childrenNodesSymbol");
const slotSymbol = Symbol.for("r2wc.slot");
const onRenderHandlerSymbol = Symbol.for("r2wc.onRenderHadlerSymbol");
const provideContextToChildrenSymbol = Symbol.for(
  "r2wc.provideContextToChildrenSymbol",
);

export function r2wcCore<
  TProps extends R2wcBaseProps,
  TProperties,
  TContextProps,
>(
  ReactComponent: ComponentType<TProps>,
  options: R2wcOptions<TProps, TProperties, TContextProps>,
  renderer: R2wcRenderer<TProps>,
): CustomElementConstructor {
  if (!options.propTypes) {
    options.propTypes = [];
  }

  if (!options.properties) {
    options.properties = [] as ArrayOfUnion<keyof TProperties>;
  }

  if (!options.events) {
    options.events = [];
  }

  const propNames = Array.isArray(options.propTypes)
    ? options.propTypes.slice()
    : (Object.keys(options.propTypes) as PropNames<TProps>);

  const eventNames = Array.isArray(options.events)
    ? options.events.slice()
    : (Object.keys(options.events) as PropNames<TProps>);

  const propTypes = {} as Partial<
    Record<PropName<TProps>, R2wcPropTransformType>
  >;
  const eventParams = {} as Partial<Record<PropName<TProps>, EventInit>>;
  const mapPropAttribute = {} as Record<PropName<TProps>, string>;
  const mapAttributeProp = {} as Record<string, PropName<TProps>>;

  for (const propName of propNames) {
    propTypes[propName] = Array.isArray(options.propTypes)
      ? "string"
      : options.propTypes[propName];

    const attribute = toDashedCase(propName);

    mapPropAttribute[propName] = attribute;
    mapAttributeProp[attribute] = propName;
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

    [connectedSymbol] = false;
    [contextSymbol]?: R2wcRenderContext<TProps>;
    [propsSymbol]: TProps = {} as TProps;
    [observerSymbol]?: MutationObserver;
    [shadowRootSymbol]: ShadowRoot;
    [slotSymbol]: string = uuid();
    [childrenNodesSymbol]: HTMLElement[] = [];

    constructor() {
      super();

      this[onRenderHandlerSymbol] = this[onRenderHandlerSymbol].bind(this);

      this[shadowRootSymbol] = this.attachShadow({
        mode: "open",
      });

      this[propsSymbol].slot = this[slotSymbol];
      this[propsSymbol].container = this[shadowRootSymbol];

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
      [...this.childNodes].forEach((node) => {
        this[childrenNodesSymbol].push(node as HTMLElement);
        node.remove();
      });

      this[connectedSymbol] = true;
      this[renderSymbol]();

      this[shadowRootSymbol].addEventListener(
        `slot-${this[slotSymbol]}-loaded`,
        this[onRenderHandlerSymbol],
      );

      this[observerSymbol] = new MutationObserver(() => {
        const childrenNodes = [...this.childNodes] as HTMLElement[];

        childrenNodes.forEach((node) => {
          node.setAttribute("slot", this[slotSymbol]);
        });

        this[renderSymbol]();
      });

      this[observerSymbol].observe(this, { childList: true });
    }

    disconnectedCallback() {
      this[connectedSymbol] = false;

      if (this[contextSymbol]) {
        renderer.unmount(this[contextSymbol]);
      }

      delete this[contextSymbol];

      this[observerSymbol]?.disconnect();
      this[childrenNodesSymbol] = [];

      this[shadowRootSymbol].removeEventListener(
        `slot-${this[slotSymbol]}-loaded`,
        this[onRenderHandlerSymbol],
      );
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

    [onRenderHandlerSymbol]() {
      for (const child of this[childrenNodesSymbol]) {
        let nodeToAppend: HTMLElement;

        if (child.nodeType === Node.TEXT_NODE) {
          const span = document.createElement("span");
          span.textContent = child.textContent;
          nodeToAppend = span;
        } else {
          nodeToAppend = child;
        }

        nodeToAppend.setAttribute("slot", this[slotSymbol]);
        this.appendChild(nodeToAppend);
      }

      this[renderSymbol]();
    }

    async [renderSymbol]() {
      if (!this[connectedSymbol]) {
        return;
      }

      // To avoid conflicts with react updates
      await Promise.resolve();

      if (!this[contextSymbol]) {
        this[contextSymbol] = renderer.mount(
          this[shadowRootSymbol],
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

      // @ts-expect-error `this` typecast
      const contextProps = provider(this, this[propsSymbol]);

      if (!contextProps) {
        return;
      }

      // Pass the context props to all observed children
      Object.keys(contextProps).forEach((prop) => {
        // @ts-expect-error dynamic key
        const rawValue = contextProps[prop];

        const type =
          options.contextPropTypes?.[
            prop as keyof typeof options.contextPropTypes
          ];
        const transform = type ? transforms[type] : null;

        if (transform && transform !== noopTransform) {
          // @ts-expect-error dynamic value
          const value = transform.stringify(rawValue);

          if (value === undefined) {
            return;
          }

          const childrenSelector = childrenComponents.join(",");
          const children = this.querySelectorAll<HTMLElement>(childrenSelector);

          const attributeName = toDashedCase(prop.toString());

          children.forEach((child) => {
            child.setAttribute(attributeName, value);
          });
        }
      });
    }
  }

  // Define getters/setters for properties
  for (const propName of options.properties) {
    Object.defineProperty(
      ReactWebComponent.prototype,
      propName as keyof typeof ReactWebComponent.prototype,
      {
        enumerable: true,
        configurable: true,
        get() {
          return this[propsSymbol][propName];
        },
        set(value) {
          this[propsSymbol][propName] = value;
          this[renderSymbol]();
        },
      },
    );
  }

  return ReactWebComponent;
}
