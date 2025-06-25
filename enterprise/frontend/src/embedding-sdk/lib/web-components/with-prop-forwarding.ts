import kebabCase from "kebab-case";

import { AttributeSerializer } from "embedding-sdk/lib/web-components/attribute-serializer";
import type { WebComponentElementConstructor } from "embedding-sdk/types/web-components";

type PropForwardingConfig<TProps> = {
  propertyNames?: (keyof TProps)[];
  propMappings?: {
    attributeName: string;
    key: string;
    parent: keyof TProps;
  }[];
} & (
  | {
      childrenComponents: string[];
      propsStorage?: never;
    }
  | {
      childrenComponents?: never;
      propsStorage: Partial<TProps>;
    }
);

export function withPropForwarding<TProps>(
  Constructor: WebComponentElementConstructor,
  {
    childrenComponents,
    propertyNames,
    propMappings,
    propsStorage,
  }: PropForwardingConfig<TProps>,
): WebComponentElementConstructor {
  return class extends Constructor {
    static get observedAttributes(): string[] {
      const parentObservedAttributes = Array.isArray(
        Constructor?.observedAttributes,
      )
        ? Constructor.observedAttributes
        : [];

      const ownObservedAttributes =
        propMappings?.map((m) => m.attributeName) ?? [];

      return [...parentObservedAttributes, ...ownObservedAttributes];
    }

    private props: Partial<TProps> = {};
    private observer?: MutationObserver;

    constructor() {
      super();

      for (const propName of propertyNames ?? []) {
        Object.defineProperty(this, propName, {
          get: () => this.props[propName],
          set: (value: any) => {
            this.props[propName] = value;
            this.update();
          },
          configurable: true,
          enumerable: true,
        });
      }
    }

    connectedCallback() {
      super.connectedCallback?.();

      if (childrenComponents?.length) {
        this.observer = new MutationObserver(() => this.update());
        this.observer.observe(this, { childList: true });
      }

      this.update();
    }

    disconnectedCallback() {
      super.disconnectedCallback?.();

      if (childrenComponents?.length) {
        this.observer?.disconnect();
      }
    }

    attributeChangedCallback(
      attributeName: string,
      oldValue: string | null,
      newValue: string | null,
    ) {
      super.attributeChangedCallback?.(attributeName, oldValue, newValue);

      const mapping = propMappings?.find(
        (prop) => prop.attributeName === attributeName,
      );

      if (mapping && newValue !== null) {
        if (!this.props[mapping.parent]) {
          this.props[mapping.parent] = {} as TProps[keyof TProps];
        }

        // @ts-expect-error dynamic key
        this.props[mapping.parent][mapping.key] = newValue;
        this.update();
      }
    }

    private update() {
      if (!childrenComponents?.length) {
        this.updateProps();
      } else {
        this.updateChildren(childrenComponents);
      }
    }

    private updateProps() {
      if (!propsStorage) {
        return;
      }

      (Object.keys(this.props) as (keyof TProps)[]).forEach((propName) => {
        const value = this.props[propName];

        if (!value || !Object.keys(value).length) {
          return;
        }

        propsStorage[propName] = value;
      });
    }

    private updateChildren(childrenComponents: string[]) {
      if (!childrenComponents?.length) {
        return;
      }

      const childrenSelector = childrenComponents.join(",");
      const children = this.querySelectorAll<HTMLElement>(childrenSelector);

      (Object.keys(this.props) as (keyof TProps)[]).forEach((propName) => {
        const value = this.props[propName];

        if (!value || !Object.keys(value).length) {
          return;
        }

        const attributeName = kebabCase(propName.toString(), false);
        const serialized = AttributeSerializer.serializeAttributeValue(value);

        children.forEach((child) => {
          child.setAttribute(attributeName, serialized);
        });
      });
    }
  };
}
