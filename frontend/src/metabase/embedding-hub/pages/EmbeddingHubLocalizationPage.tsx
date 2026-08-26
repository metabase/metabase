import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { useHasTokenFeature } from "metabase/common/hooks";
import { LocalizationUpsellPage } from "metabase/embedding-hub/upsells";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

/**
 * Content translation only. Unlike the other tabs, it duplicates the admin
 * embedding section's UI rather than linking to it -- admin's copy is
 * removed separately, when EMB-1526 drops the admin embedding route.
 *
 * The instance-wide localization settings -- site-locale, report-timezone,
 * start-of-week, custom-formatting -- stay in admin and are not surfaced.
 */
export function EmbeddingHubLocalizationPage() {
  const hasContentTranslation = useHasTokenFeature("content_translation");

  if (!hasContentTranslation) {
    return <LocalizationUpsellPage />;
  }

  return (
    <SettingsPageWrapper title={t`Localization`}>
      <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />
    </SettingsPageWrapper>
  );
}
