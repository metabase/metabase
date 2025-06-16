import type { WebComponentElementConstructor } from "embedding-sdk/types/web-components";

const CONFIG = {
  props: {
    include: ["metabase-instance-url", "api-key", "fetch-request-token"],
  },
  components: ["interactive-question", "interactive-dashboard"],
};

export function createMetabaseProviderWebComponent(): WebComponentElementConstructor {
  const includedProps = CONFIG.props?.include || [];
  const targetComponents = CONFIG.components || ["mb-question"];

  return class extends HTMLElement {
    private observer: MutationObserver | null = null;

    connectedCallback() {
      this.passPropsToChildren();

      this.observer = new MutationObserver(() => {
        this.passPropsToChildren();
      });

      this.observer.observe(this, { childList: true });

      // To properly position elements
      this.style.position = "relative";
      this.style.zIndex = "0";
    }

    disconnectedCallback() {
      this.observer?.disconnect();
    }

    attributeChangedCallback() {
      this.passPropsToChildren();
    }

    private passPropsToChildren() {
      const selector = targetComponents.join(",");
      const targetElements = this.querySelectorAll(selector);

      targetElements.forEach((element) => {
        Array.from(this.attributes).forEach((attr) => {
          // Only pass included props if the include list is not empty
          if (includedProps.length === 0 || includedProps.includes(attr.name)) {
            element.setAttribute(attr.name, attr.value);
          }
        });

        for (const key in this) {
          // Only pass included props if the include list is not empty
          if (includedProps.length === 0 || includedProps.includes(key)) {
            // Skip built-in properties and methods
            if (
              !key.startsWith("_") &&
              typeof this[key] !== "function" &&
              ![
                "attributes",
                "children",
                "classList",
                "className",
                "id",
                "innerHTML",
                "nodeName",
                "style",
              ].includes(key)
            ) {
              (element as unknown as Record<string, unknown>)[key] = this[key];
            }
          }
        }
      });
    }

    static get observedAttributes() {
      return includedProps.length > 0 ? includedProps : [];
    }
  };
}
