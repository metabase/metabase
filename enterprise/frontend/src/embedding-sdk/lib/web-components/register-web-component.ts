import type { WebComponentElementConstructor } from "embedding-sdk/types/web-components";

export function registerWebComponent(
  name: string,
  constructor: WebComponentElementConstructor,
) {
  const alreadyDefined = customElements.get(name);

  if (alreadyDefined) {
    return;
  }

  customElements.define(name, constructor);
}
