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

      targetElements.forEach(element => {
        // Pass attributes
        Array.from(this.attributes).forEach(attr => {
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

const MbQuestion = shadow =>
  r2wc(
    ({
      metabaseInstanceUrl,
      authProviderUri,
      fetchRequestToken,
      questionId,
    }) => {
      console.log({
        metabaseInstanceUrl,
        authProviderUri,
        fetchRequestToken,
        questionId,
      });
      return (
        <MetabaseProvider
          authConfig={{
            metabaseInstanceUrl,
            authProviderUri,
            fetchRequestToken,
          }}
        >
          <InteractiveQuestion questionId={questionId} />
        </MetabaseProvider>
      );
    },
    {
      shadow,
      props: {
        questionId: "number",
        metabaseInstanceUrl: "string",
        authProviderUri: "string",
        fetchRequestToken: "function",
      },
    },
  );

const MbDashboard = shadow =>
  r2wc(
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
      shadow,
      props: {
        dashboardId: "number",
        metabaseInstanceUrl: "string",
        authProviderUri: "string",
        fetchRequestToken: "function",
      },
    },
  );

customElements.define("mb-question-open", MbQuestion("open"));
customElements.define("mb-question-closed", MbQuestion("closed"));
customElements.define("mb-question", MbQuestion(undefined));
customElements.define("mb-dashboard-open", MbDashboard("open"));
customElements.define("mb-dashboard-closed", MbDashboard("closed"));
customElements.define("mb-dashboard", MbDashboard(undefined));
