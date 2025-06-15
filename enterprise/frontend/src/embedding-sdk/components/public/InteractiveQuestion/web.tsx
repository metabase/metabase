import r2wc from "@r2wc/react-to-web-component";
import type { DetailedHTMLProps, HTMLAttributes } from "react";

import type { MetabaseAuthConfigWithJwt } from "embedding-sdk/types";

import {
  EditableDashboard,
  type EditableDashboardProps,
  type InteractiveDashboardProps,
} from "../InteractiveDashboard";
import { MetabaseProvider } from "../MetabaseProvider";

import {
  InteractiveQuestion,
  type InteractiveQuestionProps,
} from "./InteractiveQuestion";
import { ShadowRootProvider } from "./shadow-root-provider";

export type MetabaseWebComponents = {
  "mb-provider": HTMLElement;

  "mb-dashboard": HTMLElement;
  "mb-dashboard-open": HTMLElement;
  "mb-dashboard-closed": HTMLElement;

  "mb-question": HTMLElement;
  "mb-question-open": HTMLElement;
  "mb-question-closed": HTMLElement;
};

export type MetabaseProviderWebComponentAttributes = {
  "metabase-instance-url"?: MetabaseAuthConfigWithJwt["metabaseInstanceUrl"];
  "fetch-request-token"?: string;
  "api-key"?: MetabaseAuthConfigWithJwt["apiKey"];
};

export type InteractiveDashboardWebComponentAttributes = {
  "dashboard-id": InteractiveDashboardProps["dashboardId"];
};

export type InteractiveQuestionWebComponentAttributes = {
  "question-id": InteractiveQuestionProps["questionId"];
};

type WebComponentAllAttributes<Attributes> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Attributes;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "mb-provider": WebComponentAllAttributes<MetabaseProviderWebComponentAttributes>;

      "mb-dashboard": WebComponentAllAttributes<InteractiveDashboardWebComponentAttributes>;
      "mb-dashboard-open": WebComponentAllAttributes<InteractiveDashboardWebComponentAttributes>;
      "mb-dashboard-closed": WebComponentAllAttributes<InteractiveDashboardWebComponentAttributes>;

      "mb-question": WebComponentAllAttributes<InteractiveQuestionWebComponentAttributes>;
      "mb-question-open": WebComponentAllAttributes<InteractiveQuestionWebComponentAttributes>;
      "mb-question-closed": WebComponentAllAttributes<InteractiveQuestionWebComponentAttributes>;
    }
  }
}

interface WebComponentInstance extends HTMLElement {
  connectedCallback?(): void;
}

type MetabaseProviderCommonWebComponentInternalProps = Required<
  Pick<
    MetabaseAuthConfigWithJwt,
    "metabaseInstanceUrl" | "apiKey" | "fetchRequestToken"
  >
>;

function injectStyles(
  Constructor: CustomElementConstructor,
): CustomElementConstructor {
  return class extends (Constructor as new () => WebComponentInstance) {
    private stylesInjected = false;

    connectedCallback() {
      // call any existing connectedCallback
      super.connectedCallback?.();

      if (this.stylesInjected) {
        return;
      }

      this.stylesInjected = true;

      const sheets: CSSStyleSheet[] = [];

      document
        .querySelectorAll<HTMLStyleElement>(
          `
              style[data-mb-styles="true"]
            `,
        )
        .forEach((node) => {
          const css = node.textContent || "";
          const sheet = new CSSStyleSheet();
          sheet.replaceSync(css);
          sheets.push(sheet);
        });

      if (this.shadowRoot) {
        this.shadowRoot.adoptedStyleSheets = [
          ...this.shadowRoot.adoptedStyleSheets,
          ...sheets,
        ];
      }
    }
  } as CustomElementConstructor;
}

type CreateMetabaseProviderConfig = {
  props?: {
    include: (keyof MetabaseProviderWebComponentAttributes)[];
  };
  components?: Exclude<keyof MetabaseWebComponents, "mb-provider">[];
};

/**
 * Factory function to create a configurable MbProvider
 * @param {Object} config Configuration options
 * @param {Object} config.props Properties configuration
 * @param {Array} config.props.include List of property names to include
 * @param {Array} config.components List of component tags to target
 * @returns {Class} Web component class
 */
function createMetabaseProvider(config: CreateMetabaseProviderConfig = {}) {
  const includedProps = config.props?.include || [];
  const targetComponents = config.components || ["mb-question"];

  return class extends HTMLElement {
    private _observer: MutationObserver | null = null;

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

      // To properly position elements
      this.style.position = "relative";
      this.style.zIndex = "0";
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
          if (
            includedProps.length === 0 ||
            includedProps.includes(
              attr.name as keyof MetabaseProviderWebComponentAttributes,
            )
          ) {
            element.setAttribute(attr.name, attr.value);
          }
        });

        // Pass properties
        for (const key in this) {
          // Only pass included props if the include list is not empty
          if (
            includedProps.length === 0 ||
            includedProps.includes(
              key as keyof MetabaseProviderWebComponentAttributes,
            )
          ) {
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

    // Observe all attribute changes or only included ones
    static get observedAttributes() {
      return includedProps.length > 0 ? includedProps : [];
    }
  };
}

// Create container with config
const MbProvider = createMetabaseProvider({
  props: {
    include: ["metabase-instance-url", "api-key", "fetch-request-token"],
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

const MbQuestion = (
  shadow: "open" | "closed" | undefined,
): CustomElementConstructor => {
  const Constructor = r2wc<
    MetabaseProviderCommonWebComponentInternalProps &
      Pick<InteractiveQuestionProps, "questionId">
  >(
    ({ metabaseInstanceUrl, apiKey, fetchRequestToken, questionId }) => {
      return (
        <ShadowRootProvider>
          <MetabaseProvider
            authConfig={{
              metabaseInstanceUrl,
              apiKey,
              fetchRequestToken,
            }}
            theme={{ fontFamily: "Lato" }}
          >
            <InteractiveQuestion questionId={questionId} />
          </MetabaseProvider>
        </ShadowRootProvider>
      );
    },
    {
      shadow,
      props: {
        questionId: "number",
        metabaseInstanceUrl: "string",
        fetchRequestToken: "function",
      },
    },
  );

  return injectStyles(Constructor);
};

const MbDashboard = (
  shadow: "open" | "closed" | undefined,
): CustomElementConstructor => {
  const Constructor = r2wc<
    MetabaseProviderCommonWebComponentInternalProps &
      Pick<EditableDashboardProps, "dashboardId">
  >(
    ({ metabaseInstanceUrl, apiKey, fetchRequestToken, dashboardId }) => (
      <ShadowRootProvider>
        <MetabaseProvider
          authConfig={{
            metabaseInstanceUrl,
            apiKey,
            fetchRequestToken,
          }}
          theme={{ fontFamily: "Lato" }}
        >
          <EditableDashboard dashboardId={dashboardId} />
        </MetabaseProvider>
      </ShadowRootProvider>
    ),
    {
      shadow,
      props: {
        dashboardId: "number",
        metabaseInstanceUrl: "string",
        apiKey: "string",
        fetchRequestToken: "function",
      },
    },
  );

  return injectStyles(Constructor);
};

customElements.define("mb-provider", MbProvider);
customElements.define("mb-question-open", MbQuestion("open"));
customElements.define("mb-question-closed", MbQuestion("closed"));
customElements.define("mb-question", MbQuestion(undefined));
customElements.define("mb-dashboard-open", MbDashboard("open"));
customElements.define("mb-dashboard-closed", MbDashboard("closed"));
customElements.define("mb-dashboard", MbDashboard(undefined));
