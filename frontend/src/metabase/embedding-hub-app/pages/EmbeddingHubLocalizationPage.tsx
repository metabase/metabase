import { t } from "ttag";

import { EmbeddingHubPlaceholderPage } from "./EmbeddingHubPlaceholderPage";

// TODO (Kelvin 2026-07-31) content translation is the one embedding-owned piece of this tab — it renders today inside the admin embedding section (EmbeddingSettings.tsx and SharedCombinedEmbeddingSettings.tsx), so it moves here rather than being mirrored. Which of the instance-wide localization settings join it is still open; see item 7 of 01-questions-for-roman.md.
export function EmbeddingHubLocalizationPage() {
  return (
    <EmbeddingHubPlaceholderPage
      title={t`Localization`}
      currentLocationLabel={t`Localization settings`}
      currentLocationUrl="/admin/settings/localization"
    />
  );
}
