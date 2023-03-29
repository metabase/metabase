import React, { ChangeEvent, KeyboardEvent, useCallback } from "react";
import { User } from "metabase-types/api";
import {
  PromptInput,
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotPrompt.styled";

export interface MetabotPromptProps {
  prompt: string;
  placeholder: string;
  user: User | null;
  isLoading?: boolean;
  onChangePrompt: (prompt: string) => void;
  onSubmitPrompt: () => void;
}

const MetabotPrompt = ({
  prompt,
  placeholder,
  user,
  isLoading = false,
  onChangePrompt,
  onSubmitPrompt,
}: MetabotPromptProps) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangePrompt(event.target.value);
    },
    [onChangePrompt],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onSubmitPrompt();
      }
    },
    [onSubmitPrompt],
  );

  return (
    <PromptSection>
      {user && <PromptUserAvatar user={user} />}
      <PromptInput
        value={prompt}
        placeholder={placeholder}
        fullWidth
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {prompt.length > 0 ? (
        <PromptRunButton
          isRunning={isLoading}
          compact
          isDirty
          onRun={onSubmitPrompt}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
