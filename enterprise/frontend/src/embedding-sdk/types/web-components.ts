import type { DetailedHTMLProps, HTMLAttributes } from "react";

type WebComponentElement = HTMLElement & {
  connectedCallback?(): void;
};

export type WebComponentElementConstructor = new () => WebComponentElement;

export type WebComponentAttributes<Attributes> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Attributes;
