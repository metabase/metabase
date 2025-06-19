import type {
  EditableDashboardWebComponentAttributes,
  InteractiveDashboardWebComponentAttributes,
  InteractiveQuestionWebComponentAttributes,
  MetabaseProviderWebComponentAttributes,
  WebComponentAttributes,
} from "./index";

declare global {
  interface HTMLElementTagNameMap {
    "metabase-provider": WebComponentAttributes<MetabaseProviderWebComponentAttributes>;

    "interactive-dashboard": WebComponentAttributes<InteractiveDashboardWebComponentAttributes>;
    "editable-dashboard": WebComponentAttributes<EditableDashboardWebComponentAttributes>;

    "interactive-question": WebComponentAttributes<InteractiveQuestionWebComponentAttributes>;
  }

  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "metabase-provider": WebComponentAttributes<MetabaseProviderWebComponentAttributes>;

        "interactive-dashboard": WebComponentAttributes<InteractiveDashboardWebComponentAttributes>;
        "editable-dashboard": WebComponentAttributes<EditableDashboardWebComponentAttributes>;

        "interactive-question": WebComponentAttributes<InteractiveQuestionWebComponentAttributes>;
      }
    }
  }
}
