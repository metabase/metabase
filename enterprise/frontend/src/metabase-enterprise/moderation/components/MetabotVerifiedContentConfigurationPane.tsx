import { t } from "ttag";

import { SettingHeader } from "metabase/admin/settings/components/SettingHeader";
import { useUpdateMetabotMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Stack, Switch } from "metabase/ui";
import type { MetabotInfo } from "metabase-types/api";

export function MetabotVerifiedContentConfigurationPane({
  metabot,
}: {
  metabot: MetabotInfo;
}) {
  const [updateMetabot, { isLoading: isUpdating }] = useUpdateMetabotMutation();
  const [sendToast] = useToast();

  const handleVerifiedContentToggle = async (checked: boolean) => {
    const result = await updateMetabot({
      id: metabot.id,
      use_verified_content: checked,
    });

    if (result.error) {
      sendToast({
        message: t`Error updating Metabot`,
        icon: "warning",
      });
    }
  };

  return (
    <Stack gap="sm">
      <SettingHeader
        id="verified-content"
        title={t`Verified or curated content`}
        description={t`When enabled, Metabot will only use content that's verified, in an official collection, or published to the library.`}
      />
      <Switch
        label={t`Only use verified or curated content`}
        checked={!!metabot.use_verified_content}
        onChange={(e) => handleVerifiedContentToggle(e.target.checked)}
        disabled={isUpdating}
        w="auto"
        size="sm"
      />
    </Stack>
  );
}
