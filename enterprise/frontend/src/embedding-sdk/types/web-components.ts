import type { DetailedHTMLProps, HTMLAttributes } from "react";

import type {
  CollectionBrowserWebComponentAttributes,
  CreateDashboardModalWebComponentAttributes,
  EditableDashboardWebComponentAttributes,
  InteractiveDashboardWebComponentAttributes,
  InteractiveQuestionWebComponentAttributes,
  MetabaseProviderWebComponentAttributes,
  StaticDashboardWebComponentAttributes,
  StaticQuestionWebComponentAttributes,
} from "embedding-sdk/components/public";

type WebComponentElement = HTMLElement & {
  container?: ShadowRoot | null;
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(
    attributeName: string,
    oldValue: string | null,
    newValue: string | null,
  ): void;
};

export type WebComponentElementConstructor = (new () => WebComponentElement) & {
  observedAttributes?: string[];
};

// eslint-disable-next-line @typescript-eslint/ban-types
export type WebComponentAttributes<Attributes = {}> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement> & Attributes,
  HTMLElement
>;

export type WebComponentElements = {
  "metabase-provider": WebComponentAttributes<MetabaseProviderWebComponentAttributes>;

  "interactive-dashboard": WebComponentAttributes<InteractiveDashboardWebComponentAttributes>;
  "editable-dashboard": WebComponentAttributes<EditableDashboardWebComponentAttributes>;
  "static-dashboard": WebComponentAttributes<StaticDashboardWebComponentAttributes>;

  "interactive-question": WebComponentAttributes<InteractiveQuestionWebComponentAttributes>;
  "static-question": WebComponentAttributes<StaticQuestionWebComponentAttributes>;

  "collection-browser": WebComponentAttributes<CollectionBrowserWebComponentAttributes>;

  "create-dashboard-modal": WebComponentAttributes<CreateDashboardModalWebComponentAttributes>;

  "metabot-question": WebComponentAttributes;
};

export type ChildrenWebComponentElementNames = keyof Omit<
  WebComponentElements,
  "metabase-provider"
>;
