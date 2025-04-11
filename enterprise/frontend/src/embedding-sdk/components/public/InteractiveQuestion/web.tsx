import r2wc from "@r2wc/react-to-web-component";

import { InteractiveDashboard } from "../InteractiveDashboard";
import { MetabaseProvider } from "../MetabaseProvider";

import { InteractiveQuestion } from "./InteractiveQuestion";
/**
 * Factory function to create a configurable MbQuestionContainer
 * @param {Object} config Configuration options
 * @param {Object} config.props Properties configuration
 * @param {Array} config.props.include List of property names to include
 * @param {Array} config.components List of component tags to target
 * @returns {Class} Web component class
 */
function MbQuestionContainer(config = {}) {
  const includedProps = config.props?.include || [];
  const targetComponents = config.components || ["mb-question"];

  return class extends HTMLElement {
    constructor() {
      super();
    }

    connectedCallback() {
      this._passPropsToChildren();

      // Set up observer for new children
      this._observer = new MutationObserver(() => {
        this._passPropsToChildren();
      });

      this._observer.observe(this, { childList: true });
    }

    disconnectedCallback() {
      if (this._observer) {
        this._observer.disconnect();
      }
    }

    attributeChangedCallback() {
      this._passPropsToChildren();
    }

    _passPropsToChildren() {
      // Build selector for target components
      const selector = targetComponents.join(",");
      const targetElements = this.querySelectorAll(selector);

      targetElements.forEach((element) => {
        // Pass attributes
        Array.from(this.attributes).forEach((attr) => {
          // Only pass included props if the include list is not empty
          if (includedProps.length === 0 || includedProps.includes(attr.name)) {
            element.setAttribute(attr.name, attr.value);
          }
        });

        // Pass properties
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
              element[key] = this[key];
            }
          }
        }
      });
    }

    // Observe all attribute changes or only included ones
    static get observedAttributes() {
      return includedProps.length > 0 ? includedProps : [];
    }
  };
}

// Create container with config
const QuestionContainer = MbQuestionContainer({
  props: {
    include: [
      "metabase-instance-url",
      "auth-provider-uri",
      "fetch-request-token",
    ],
  },
  components: [
    "mb-question",
    "mb-question-open",
    "mb-question-closed",
    "mb-dashboard",
    "mb-dashboard-open",
    "mb-dashboard-closed",
  ],
});

// Register the element
customElements.define("mb-provider", QuestionContainer);

// Create a shared stylesheet that will be updated when styles change
const sharedStyles = new CSSStyleSheet();

// Function to collect all styles from document
const collectStyles = async () => {
  // Get inline styles
  const inlineStyles = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");

  // Get linked stylesheets
  const linkedStyles = await Promise.all(
    Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
      async (link) => {
        if (!(link instanceof HTMLLinkElement)) {
          return "";
        }
        try {
          const response = await fetch(link.href);
          return response.text();
        } catch (e) {
          console.warn("Failed to fetch stylesheet:", link.href);
          return "";
        }
      },
    ),
  );

  return inlineStyles + "\n" + linkedStyles.join("\n");
};

// Observer to watch for style changes
const styleObserver = new MutationObserver(async (_mutations) => {
  const styles = await collectStyles();
  sharedStyles.replaceSync(styles);
});

// Start observing style changes
styleObserver.observe(document.head, {
  childList: true,
  subtree: true,
  characterData: true,
});

// Initial style collection
collectStyles().then((styles) => {
  sharedStyles.replaceSync(styles);
});

// Helper to create a web component with style adoption
const createStyledWebComponent = (
  Component: React.ComponentType<any>,
  props: Partial<Record<string, "string" | "number" | "boolean" | "function">>,
  shadow?: "open" | "closed",
) => {
  const WebComponent = r2wc(Component, {
    shadow,
    props,
  });

  return class extends WebComponent {
    constructor() {
      super();
      if (this.shadowRoot) {
        this.shadowRoot.adoptedStyleSheets = [sharedStyles];
      }
    }
  };
};

const MbQuestion = (shadow: "open" | "closed" | undefined) =>
  createStyledWebComponent(
    ({
      metabaseInstanceUrl,
      authProviderUri,
      fetchRequestToken,
      questionId,
    }) => (
      <MetabaseProvider
        authConfig={{
          metabaseInstanceUrl,
          authProviderUri,
          fetchRequestToken,
        }}
      >
        <InteractiveQuestion questionId={questionId} />
      </MetabaseProvider>
    ),
    {
      questionId: "number",
      metabaseInstanceUrl: "string",
      authProviderUri: "string",
      fetchRequestToken: "function",
    },
    shadow,
  );

const MbDashboard = (shadow: "open" | "closed" | undefined) =>
  createStyledWebComponent(
    ({
      metabaseInstanceUrl,
      authProviderUri,
      fetchRequestToken,
      dashboardId,
    }) => (
      <MetabaseProvider
        authConfig={{
          metabaseInstanceUrl,
          authProviderUri,
          fetchRequestToken,
        }}
      >
        <InteractiveDashboard dashboardId={dashboardId} />
      </MetabaseProvider>
    ),
    {
      dashboardId: "number",
      metabaseInstanceUrl: "string",
      authProviderUri: "string",
      fetchRequestToken: "function",
    },
    shadow,
  );

customElements.define("mb-question-open", MbQuestion("open"));
customElements.define("mb-question-closed", MbQuestion("closed"));
customElements.define("mb-question", MbQuestion(undefined));
customElements.define("mb-dashboard-open", MbDashboard("open"));
customElements.define("mb-dashboard-closed", MbDashboard("closed"));
customElements.define("mb-dashboard", MbDashboard(undefined));
