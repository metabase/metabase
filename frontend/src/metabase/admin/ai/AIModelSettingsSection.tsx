import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { LlmModelPicker } from "metabase/metabot";
import { Stack } from "metabase/ui";

export function AIModelSettingsSection({ id }: { id?: string }) {
  return (
    <SettingsSection
      id={id}
      title={t`Models`}
      description={t`Pick which model each AI feature runs on. Models come from the providers you've connected.`}
    >
      <Stack gap="xl">
        <LlmModelPicker
          settingKey="llm-metabot-provider"
          label={t`Default model`}
          description={t`Metabot, AI explorations and SQL generation all run on this model.`}
        />
        <LlmModelPicker
          settingKey="llm-mini-model"
          label={t`Mini model`}
          description={t`Quick tasks, like naming conversations, run on this cheaper model. Defaults to the fastest model from the same provider as the default model.`}
        />
      </Stack>
    </SettingsSection>
  );
}
