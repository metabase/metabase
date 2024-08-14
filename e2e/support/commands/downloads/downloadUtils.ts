export * from "./downloadUtils-untyped";

/**
 * NOTE: Cypress commands are deprecated in favor of custom functions, as they
 * are easier to type. These commands rely on cypress tasks and were not easy to
 * type.
 */

declare global {
  namespace Cypress {
    interface Chainable {
      deleteDownloadsFolder: () => Cypress.Chainable<unknown>;
      verifyDownload: (
        fileName: string,
        options?: any,
      ) => Cypress.Chainable<unknown>;
    }
  }
}
