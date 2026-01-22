import type * as Lib from "metabase-lib";

import type { GetMetadataOpts } from "./types";

export async function getMetadataProvider(
  opts?: GetMetadataOpts,
): Cypress.Chainable<Lib.MetadataProvider> {
  const { getMetadataProvider } = await import("./metadata-provider");
  return getMetadataProvider(opts);
}
