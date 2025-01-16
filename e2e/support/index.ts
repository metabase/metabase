// H is for helpers 🤗
import * as H from "./helpers";

type HelperTypes = typeof H;

declare global {
  namespace Cypress {
    interface Chainable extends HelperTypes {}
  }
}

export { H };
