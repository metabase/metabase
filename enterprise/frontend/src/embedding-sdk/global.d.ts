import type { WebComponentElements } from "embedding-sdk/types/web-components";

declare global {
  interface HTMLElementTagNameMap extends WebComponentElements {}

  namespace React {
    namespace JSX {
      interface IntrinsicElements extends WebComponentElements {}
    }
  }
}
