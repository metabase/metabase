import type { DetailedHTMLProps, HTMLAttributes } from "react";

import type { MetabaseAuthConfig, MetabaseTheme } from "embedding-sdk";

type WebComponentElement = HTMLElement & {
  container?: ShadowRoot | null;
  connectedCallback?(): void;
};

export type WebComponentElementConstructor = new () => WebComponentElement;

export type WebComponentAttributes<Attributes> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Attributes;

export type MetabaseProviderInternalProps = {
  authConfig: Partial<MetabaseAuthConfig>;
  theme: Partial<MetabaseTheme>;
};
