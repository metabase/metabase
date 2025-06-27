import type { DetailedHTMLProps, HTMLAttributes } from "react";

import type { MetabaseAuthConfig, MetabaseTheme } from "embedding-sdk";

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

export type MetabaseProviderInternalProps = {
  authConfig: Partial<MetabaseAuthConfig>;
  theme: Partial<MetabaseTheme>;
};
