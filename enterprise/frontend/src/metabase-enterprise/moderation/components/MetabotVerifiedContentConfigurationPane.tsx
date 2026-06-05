import { jt, t } from "ttag";

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
        title={t`Verified content`}
        description={jt`When enabled, Metabot will only use models and metrics marked as Verified.`}
      />
      <Switch
        label={t`Only use Verified content`}
        checked={!!metabot.use_verified_content}
        onChange={(e) => handleVerifiedContentToggle(e.target.checked)}
        disabled={isUpdating}
        w="auto"
        size="sm"
      />
    </Stack>
  );
}
