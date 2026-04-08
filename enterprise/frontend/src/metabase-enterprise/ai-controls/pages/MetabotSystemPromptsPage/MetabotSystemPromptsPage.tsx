import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text, Textarea } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import { useAdminSettingWithDebouncedInput } from "metabase-enterprise/ai-controls/hooks";

import S from "./MetabotSystemPromptsPage.module.css";

type SystemPromptSettingKey =
  | "metabot-chat-system-prompt"
  | "metabot-nlq-system-prompt"
  | "metabot-sql-system-prompt";

type SystemPromptPageProps = {
  title: string;
  description: string;
  settingKey: SystemPromptSettingKey;
};

function SystemPromptPage(props: SystemPromptPageProps) {
  const { title, description, settingKey } = props;
  const { handleInputChange, inputValue } = useAdminSettingWithDebouncedInput<
    string | null
  >(settingKey);

  return (
    <SettingsPageWrapper title={title} mt="sm">
      <SettingsSection>
        <Text c="text-secondary" size="md" mb="lg">
          {description}
        </Text>
        <Textarea
          aria-label={title}
          className={S.textareaWrapper}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={getPlaceholder()}
          value={inputValue || ""}
        />
      </SettingsSection>
    </SettingsPageWrapper>
  );
}

const getPlaceholder = () => {
  return (
    t`# Here's a section` +
    "\n" +
    t`1. Do this` +
    "\n" +
    t`2. And this` +
    "\n" +
    t`3. And lastly, this` +
    "\n\n" +
    t`# Here's another section` +
    "\n" +
    t`1. Do this` +
    "\n" +
    t`2. And this` +
    "\n" +
    t`3. And lastly, this`
  );
};

export function MetabotChatPromptPage() {
  const applicationName = useSelector(getApplicationName);

  return (
    <SystemPromptPage
      title={t`Metabot chat prompt instructions`}
      description={t`Add instructions here for the sidebar AI chat experience in ${applicationName}. You might want to give instructions about tone, types of entities to prefer, and things like that.`}
      settingKey="metabot-chat-system-prompt"
    />
  );
}

export function NaturalLanguagePromptPage() {
  const applicationName = useSelector(getApplicationName);

  return (
    <SystemPromptPage
      title={t`Natural language query prompt instructions`}
      description={t`Add instructions for the "AI exploration" or natural language query experience in ${applicationName}. You could suggest tables to prefer in answers, specific chart types to default to, and more.`}
      settingKey="metabot-nlq-system-prompt"
    />
  );
}

export function SqlGenerationPromptPage() {
  return (
    <SystemPromptPage
      title={t`SQL generation prompt instructions`}
      description={t`If you have preferences about joins, uppercase vs. lowercase, how many spaces to use for indentation, or anything else SQL-related, this is the place to put it.`}
      settingKey="metabot-sql-system-prompt"
    />
  );
}
