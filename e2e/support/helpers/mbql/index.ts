import type * as Lib from "metabase-lib";

import type { GetMetadataOpts } from "./types";

export function getMetadataProvider(
  opts?: GetMetadataOpts,
): Cypress.Chainable<Lib.MetadataProvider> {
  const promise = import("./metadata-provider").then(
    ({ getMetadataProvider }) => getMetadataProvider(opts),
  );

  // @ts-expect-error: Cypress.Chainable collapses the Promise, but the types do not reflect that
  return cy.wrap(promise) as Cypress.Chainable<Lib.MetadataProvider>;
}
