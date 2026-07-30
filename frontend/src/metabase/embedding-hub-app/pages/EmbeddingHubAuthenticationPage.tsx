import { t } from "ttag";

import { EmbeddingHubPlaceholderPage } from "./EmbeddingHubPlaceholderPage";

// TODO (Kelvin 2026-07-31) items 13 and 14 of 01-questions-for-roman.md are still open: whether the User provisioning radio appears here, and whether the JWT regenerate button appears at all (EMB-1849). The tab is JWT-only (resolved), so it mirrors SettingsJWTForm once those two are answered.
export function EmbeddingHubAuthenticationPage() {
  return (
    <EmbeddingHubPlaceholderPage
      title={t`Authentication`}
      currentLocationLabel={t`Authentication settings`}
      currentLocationUrl="/admin/settings/authentication"
    />
  );
}
