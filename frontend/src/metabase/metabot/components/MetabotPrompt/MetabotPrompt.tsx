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
  onCancel?: () => void;
}

const MetabotPrompt = ({
  prompt,
  placeholder,
  user,
  isLoading = false,
  onChangePrompt,
  onSubmitPrompt,
  onCancel,
}: MetabotPromptProps) => {
  const canSubmit = prompt.length > 0;

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangePrompt(event.target.value);
    },
    [onChangePrompt],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (canSubmit && event.key === "Enter") {
        onSubmitPrompt();
      }
    },
    [canSubmit, onSubmitPrompt],
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
      {canSubmit ? (
        <PromptRunButton
          isRunning={isLoading}
          compact
          isDirty
          onRun={onSubmitPrompt}
          onCancel={onCancel}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
