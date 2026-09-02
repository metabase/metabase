import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { LlmModelPicker } from "metabase/metabot";
import { useSetting } from "metabase/settings";
import { Stack } from "metabase/ui";

export function AIModelSettingsSection({ id }: { id?: string }) {
  const supportsFastMode = useSetting("llm-metabot-supports-fast-mode?");

  return (
    <SettingsSection
      id={id}
      title={t`Models`}
      description={t`Pick which model each AI feature runs on. Models come from the providers you've connected.`}
    >
      <Stack gap="lg">
        <LlmModelPicker
          settingKey="llm-metabot-provider"
          label={t`Default model`}
          description={t`Metabot, AI explorations and SQL generation all run on this model.`}
        />
        {supportsFastMode && (
          <AdminSettingInput
            name="llm-fast-mode"
            title={t`Fast mode`}
            description={t`Get faster responses from the default model at a higher price per token. On Anthropic, this requires an account enrolled in the fast mode research preview, and isn't available with a Priority Tier commitment.`}
            inputType="boolean"
          />
        )}
        <LlmModelPicker
          settingKey="llm-mini-model"
          label={t`Mini model`}
          description={t`Quick tasks, like naming conversations, run on this cheaper model. Defaults to the fastest model from the same provider as the default model.`}
        />
      </Stack>
    </SettingsSection>
  );
}
