// H is for helpers 🤗
import * as H from "./helpers";

type HelperTypes = typeof H;

declare global {
  namespace Cypress {
    interface Chainable {
      H: HelperTypes;
      /** Asserts that the subject is inside the viewport (see `commands/visibility`) */
      isRenderedWithinViewport(): Chainable<JQuery<HTMLElement>>;
    }
  }
}

export { H };
