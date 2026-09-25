import { jt, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { LlmModelPicker } from "metabase/metabot";
import { useSetting } from "metabase/settings";
import {
  AdminSettingInput,
  SettingsSection,
} from "metabase/settings-components";
import { Stack } from "metabase/ui";

export function AIModelSettingsSection({ id }: { id?: string }) {
  const supportsFastMode = useSetting("llm-metabot-supports-fast-mode?");

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
        {supportsFastMode && (
          <AdminSettingInput
            name="llm-fast-mode"
            title={t`Fast mode`}
            description={jt`Get faster responses from the same model for everyone using Metabot, AI explorations, and SQL generation. This costs more per token and may fall back to standard speed. When off, OpenAI uses standard processing. Check ${(
              <ExternalLink
                key="openai"
                href="https://developers.openai.com/api/docs/pricing"
              >
                {t`OpenAI pricing`}
              </ExternalLink>
            )} and ${(
              <ExternalLink
                key="anthropic"
                href="https://platform.claude.com/docs/en/build-with-claude/fast-mode"
              >
                {t`Anthropic pricing and preview requirements`}
              </ExternalLink>
            )} for account restrictions.`}
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
