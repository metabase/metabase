import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { setupEnterpriseOnlyPlugin } from "../enterprise";
import { setupTokenStatusEndpoint } from "../server-mocks";

export type EnterprisePluginName = Parameters<
  typeof setupEnterpriseOnlyPlugin
>[0];

export type EnterpriseScenarioOptions = {
  /** Enterprise plugin modules to register before render. */
  plugins?: EnterprisePluginName[];
  /** Token features to enable. Other features default to `false`. */
  tokenFeatures?: Partial<TokenFeatures>;
  /**
   * Whether the token-status endpoint should report `valid: true`.
   * Defaults to `true` when any plugin or token feature is set,
   * `false` otherwise.
   */
  tokenValid?: boolean;
};

/**
 * Wires the three things every enterprise-aware test needs:
 *   1. Loads the requested enterprise plugin modules.
 *   2. Registers `GET /api/premium-features/token/status`.
 *   3. Returns a Settings fragment with `token-features` set, ready to
 *      merge into `mockSettings({...})`.
 *
 * Usage:
 *   const settingsFragment = setupEnterpriseScenario({
 *     plugins: ["whitelabel"],
 *     tokenFeatures: { whitelabel: true },
 *   });
 *   const settings = mockSettings({ ...settingsFragment, "site-name": "X" });
 */
export function setupEnterpriseScenario({
  plugins = [],
  tokenFeatures = {},
  tokenValid,
}: EnterpriseScenarioOptions = {}) {
  plugins.forEach(setupEnterpriseOnlyPlugin);
  const valid =
    tokenValid ?? (plugins.length > 0 || Object.keys(tokenFeatures).length > 0);
  setupTokenStatusEndpoint({
    valid,
    features: Object.entries(tokenFeatures)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name),
  });
  return {
    "token-features": createMockTokenFeatures(tokenFeatures),
  } as const;
}
