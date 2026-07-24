/**
 * Helpers for admin settings specs.
 */
import fs from "fs";
import path from "path";

import type { MetabaseApi } from "./api";

/** Port of getSamlCertificate() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
export function getSamlCertificate(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../test_resources/sso/auth0-public-idp.cert"),
    "utf8",
  );
}

/** Port of setupSaml() from e2e/test/scenarios/admin-2/sso/shared/helpers.js. */
export async function setupSaml(api: MetabaseApi) {
  await api.put("/api/setting", {
    "saml-enabled": true,
    "saml-identity-provider-uri": "https://example.test",
    "saml-identity-provider-certificate": getSamlCertificate(),
    "saml-identity-provider-issuer": "https://example.test/issuer",
  });
}

/**
 * Whether the backend is an OSS build (version tags are v0.x for OSS, v1.x
 * for EE). Playwright has no Cypress-style `@OSS` tag filtering, so OSS-only
 * tests probe the running backend instead. Dev backends with an unresolved
 * version tag report as "not OSS", which errs on the side of skipping.
 */
export async function isOssBackend(api: MetabaseApi): Promise<boolean> {
  const response = await api.get("/api/session/properties");
  const properties = (await response.json()) as {
    version?: { tag?: string };
  };
  return /^v0\./.test(properties.version?.tag ?? "");
}
