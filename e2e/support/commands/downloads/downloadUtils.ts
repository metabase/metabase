export * from "./downloadUtils-untyped";

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
