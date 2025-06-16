import type {
  InteractiveDashboardWebComponentAttributes,
  InteractiveQuestionWebComponentAttributes,
  MetabaseProviderWebComponentAttributes,
  WebComponentAttributes,
} from "embedding-sdk";

declare global {
  interface HTMLElementTagNameMap {
    "metabase-provider": WebComponentAttributes<MetabaseProviderWebComponentAttributes>;
    "interactive-dashboard": WebComponentAttributes<InteractiveDashboardWebComponentAttributes>;
    "interactive-question": WebComponentAttributes<InteractiveQuestionWebComponentAttributes>;
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "metabase-provider": WebComponentAttributes<MetabaseProviderWebComponentAttributes>;
        "interactive-dashboard": WebComponentAttributes<InteractiveDashboardWebComponentAttributes>;
        "interactive-question": WebComponentAttributes<InteractiveQuestionWebComponentAttributes>;
      }
    }
  }
}
