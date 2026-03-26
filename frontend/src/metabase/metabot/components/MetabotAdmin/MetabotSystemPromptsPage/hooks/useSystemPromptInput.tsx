import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useState } from "react";

import { useAdminSetting } from "metabase/api/utils";

const DEBOUNCE_DELAY = 500;

export function useSystemPromptInput() {
  const { value: metabotSystemPrompt, updateSetting } = useAdminSetting(
    "metabot-system-prompt",
  );
  const [inputText, setInputText] = useState<string>(metabotSystemPrompt || "");

  const debouncedUpdateSystemPrompt = useDebouncedCallback((value: string) => {
    updateSetting({
      key: "metabot-system-prompt",
      value: value || null,
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
