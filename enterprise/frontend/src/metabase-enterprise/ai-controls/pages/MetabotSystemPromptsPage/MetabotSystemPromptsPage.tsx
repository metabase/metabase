import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { CodeEditor } from "metabase/common/components/CodeEditor";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { useAdminSettingWithBlurInput } from "metabase-enterprise/ai-controls/hooks";

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
  const { handleInputChange, handleBlur, inputValue } =
    useAdminSettingWithBlurInput(settingKey);

  const extensions = useMemo(
    () => [
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": title }),
    ],
    [title],
  );

  return (
    <SettingsPageWrapper
      title={title}
      description={description}
      className={S.wrapper}
    >
      <CodeEditor
        aria-label={title}
        className={S.editor}
        extensions={extensions}
        language="markdown"
        lineNumbers={false}
        onBlur={handleBlur}
        onChange={handleInputChange}
        placeholder={getPlaceholder()}
        value={inputValue || ""}
      />
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
    t`3. And lastly, this`
  );
};

export function MetabotChatPromptPage() {
  const applicationName = useSelector(getApplicationName);

  return (
    <SystemPromptPage
      title={t`AI chat prompt instructions`}
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
