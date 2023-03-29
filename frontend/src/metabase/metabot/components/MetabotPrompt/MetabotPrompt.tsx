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
  onChangeQuery: (prompt: string) => void;
  onSubmitQuery: () => void;
}

const MetabotPrompt = ({
  prompt,
  placeholder,
  user,
  isLoading = false,
  onChangeQuery,
  onSubmitQuery,
}: MetabotPromptProps) => {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChangeQuery(event.target.value);
    },
    [onChangeQuery],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onSubmitQuery();
      }
    },
    [onSubmitQuery],
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
          onRun={onSubmitQuery}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
