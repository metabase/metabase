import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { LocalizationUpsellPage } from "metabase/embedding-hub/upsells";
import { PLUGIN_CONTENT_TRANSLATION } from "metabase/plugins";
import { SettingsPageWrapper } from "metabase/settings-components/SettingsSection";

/**
 * Content translation only. Other tabs link out to admin for anything
 * outside their own scope. This one reuses the exact settings component
 * the admin embedding section renders instead, because content translation
 * has no standalone admin page to link to. That admin usage goes away
 * separately, when EMB-1526 drops the admin embedding route.
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
