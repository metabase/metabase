import * as Urls from "metabase/urls";

import { getTenantsBasePath } from "./base-path";

/** Used to drop the headings the hub's Tenancy tab already supplies, based on where the tenant routes are mounted. */
export function isEmbeddingHubTenancy() {
  return getTenantsBasePath() === Urls.embeddingHubTenancy();
}
