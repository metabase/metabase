import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useEffect, useState } from "react";

import { useAdminSetting } from "metabase/api/utils";

export type SystemPromptSettingKey =
  | "metabot-chat-system-prompt"
  | "metabot-nlq-system-prompt"
  | "metabot-sql-system-prompt";

const DEBOUNCE_DELAY = 500;

export function useSystemPromptInput(settingKey: SystemPromptSettingKey) {
  const { value: systemPrompt, updateSetting } = useAdminSetting(settingKey);
  const [inputText, setInputText] = useState<string>(systemPrompt || "");

  useEffect(() => {
    if (systemPrompt != null) {
      setInputText(systemPrompt);
    }
  }, [systemPrompt]);

  const debouncedUpdateSystemPrompt = useDebouncedCallback((value: string) => {
    updateSetting({
      key: settingKey,
      value: value || null,
      toast: false,
    });
  }, DEBOUNCE_DELAY);

  const onInputChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = event.currentTarget.value;
    setInputText(newValue);
    debouncedUpdateSystemPrompt(newValue);
  };

  return {
    inputText,
    onInputChange,
  };
}
