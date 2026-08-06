import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellContentTranslation } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";

/**
 * Content translation only. It renders today *only* from the admin embedding
 * section, so this is the one tab with a genuine migration in it: it moves
 * here and admin loses it.
 *
 * The instance-wide localization settings -- site-locale, report-timezone,
 * start-of-week, custom-formatting -- stay in admin and are not surfaced.
 */
export function EmbeddingHubLocalizationPage() {
  const hasContentTranslation = useHasTokenFeature("content_translation");

  return (
    <SettingsPageWrapper title={t`Localization`}>
      {hasContentTranslation ? (
        <PLUGIN_CONTENT_TRANSLATION.ContentTranslationConfiguration />
      ) : (
        <UpsellContentTranslation source="embedding-hub-localization" />
      )}
    </SettingsPageWrapper>
  );
}
