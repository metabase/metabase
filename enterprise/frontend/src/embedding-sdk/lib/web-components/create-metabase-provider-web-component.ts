import kebabCase from "kebab-case";

import { AttributeSerializer } from "embedding-sdk/lib/web-components/attribute-serializer";
import type {
  MetabaseProviderInternalProps,
  WebComponentElementConstructor,
} from "embedding-sdk/types/web-components";

export function createMetabaseProviderWebComponent(): WebComponentElementConstructor {
  const propMappings = [
    {
      attributeName: "metabase-instance-url",
      key: "metabaseInstanceUrl",
      parent: "authConfig",
    },
    { attributeName: "api-key", key: "apiKey", parent: "authConfig" },
    {
      attributeName: "fetch-request-token",
      key: "fetchRequestToken",
      parent: "authConfig",
    },
  ] as const;

  const childrenSelector = [
    "interactive-question",
    "interactive-dashboard",
  ].join(",");

  return class MetabaseProvider extends HTMLElement {
    static observedAttributes = propMappings.map((m) => m.attributeName);

    private props: MetabaseProviderInternalProps = {
      authConfig: {},
      theme: {},
    };

    get authConfig() {
      return this.props.authConfig;
    }
    set authConfig(value) {
      this.props.authConfig = value;
      this.updateChildren();
    }

    get theme() {
      return this.props.theme;
    }
    set theme(value) {
      this.props.theme = value;
      this.updateChildren();
    }

    private observer?: MutationObserver;

    connectedCallback() {
      this.observer = new MutationObserver(() => this.updateChildren());
      this.observer.observe(this, { childList: true });
      this.updateChildren();
    }

    disconnectedCallback() {
      this.observer?.disconnect();
    }

    attributeChangedCallback(
      attributeName: string,
      oldValue: string | null,
      newValue: string | null,
    ) {
      const mapping = propMappings.find(
        (prop) => prop.attributeName === attributeName,
      );

      if (mapping && newValue !== null) {
        // @ts-expect-error dynamic key
        this.props[mapping.parent][mapping.key] = newValue;
        this.updateChildren();
      }
    }

    private updateChildren() {
      const children = this.querySelectorAll<HTMLElement>(childrenSelector);

      (
        Object.keys(this.props) as (keyof MetabaseProviderInternalProps)[]
      ).forEach((propName) => {
        const value = this.props[propName];

        if (!value || !Object.keys(value).length) {
          return;
        }

        const attributeName = kebabCase(propName, false);
        const serialized = AttributeSerializer.serializeAttributeValue(value);

        children.forEach((child) => {
          child.setAttribute(attributeName, serialized);
        });
      });
    }
  };
}
