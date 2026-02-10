import r2wc from "@r2wc/react-to-web-component";

import { EMBEDDING_SDK_CONFIG } from "metabase/embedding-sdk/config";

// Enable SDK mode as we are in the SDK bundle
EMBEDDING_SDK_CONFIG.isEmbeddingSdk = true;

// Import the embedding SDK vendors side-effects
import "metabase/embedding-sdk/vendors-side-effects";

// Import the EE plugins required by the embedding sdk.
import { initializePlugins } from "sdk-ee-plugins";

initializePlugins();

import {
  MetabaseDashboardWrapper,
  MetabaseQuestionWrapper,
  MetabaseBrowserWrapper,
  MetabaseMetabotWrapper,
  type DashboardWrapperProps,
  type QuestionWrapperProps,
  type BrowserWrapperProps,
  type MetabotWrapperProps,
} from "./components/WebComponentWrappers";

// Props configuration for r2wc
// r2wc converts kebab-case attributes to camelCase props automatically

const baseProps = {
  instanceUrl: "string",
  apiKey: "string",
  isGuest: "boolean",
  jwtProviderUri: "string",
  theme: "json",
  locale: "string",
} as const;

const dashboardProps = {
  ...baseProps,
  dashboardId: "string", // can be number or string, r2wc will pass as string
  token: "string",
  drills: "boolean",
  withTitle: "boolean",
  withDownloads: "boolean",
  withSubscriptions: "boolean",
  initialParameters: "json",
  hiddenParameters: "json",
} as const;

const questionProps = {
  ...baseProps,
  questionId: "string", // can be number or string
  token: "string",
  drills: "boolean",
  withTitle: "boolean",
  withDownloads: "boolean",
  withAlerts: "boolean",
  isSaveEnabled: "boolean",
  targetCollection: "string",
  entityTypes: "json",
  initialSqlParameters: "json",
  hiddenParameters: "json",
} as const;

const browserProps = {
  ...baseProps,
  initialCollection: "string",
  readOnly: "boolean",
  collectionVisibleColumns: "json",
  collectionPageSize: "number",
  collectionEntityTypes: "json",
  dataPickerEntityTypes: "json",
  withNewQuestion: "boolean",
  withNewDashboard: "boolean",
} as const;

const metabotProps = {
  ...baseProps,
  layout: "string",
} as const;

// Create web components using r2wc
// Note: Not using shadow DOM because Emotion/CSS styles are injected into document.head
// and won't apply inside shadow roots. The SDK already scopes styles with .mb-wrapper.
const MetabaseDashboardElement = r2wc(MetabaseDashboardWrapper, {
  props: dashboardProps,
});

const MetabaseQuestionElement = r2wc(MetabaseQuestionWrapper, {
  props: questionProps,
});

const MetabaseBrowserElement = r2wc(MetabaseBrowserWrapper, {
  props: browserProps,
});

const MetabaseMetabotElement = r2wc(MetabaseMetabotWrapper, {
  props: metabotProps,
});

// Register custom elements
if (typeof window !== "undefined") {
  if (!customElements.get("metabase-dashboard")) {
    customElements.define("metabase-dashboard", MetabaseDashboardElement);
  }
  if (!customElements.get("metabase-question")) {
    customElements.define("metabase-question", MetabaseQuestionElement);
  }
  if (!customElements.get("metabase-browser")) {
    customElements.define("metabase-browser", MetabaseBrowserElement);
  }
  if (!customElements.get("metabase-metabot")) {
    customElements.define("metabase-metabot", MetabaseMetabotElement);
  }
}

export {
  MetabaseDashboardElement,
  MetabaseQuestionElement,
  MetabaseBrowserElement,
  MetabaseMetabotElement,
};

// For backwards compatibility, also export with old names
export { MetabaseBrowserElement as MetabaseManageContentElement };
