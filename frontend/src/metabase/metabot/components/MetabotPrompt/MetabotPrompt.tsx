import React, { ChangeEvent, KeyboardEvent, useCallback } from "react";
import { User } from "metabase-types/api";
import {
  PromptInput,
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotPrompt.styled";

export interface MetabotPromptProps {
  query: string;
  user?: User;
  placeholder?: string;
  isLoading?: boolean;
  onQueryChange: (query: string) => void;
  onQuerySubmit: () => void;
}

const MetabotPrompt = ({
  query,
  user,
  placeholder,
  isLoading = false,
  onQueryChange,
  onQuerySubmit,
}: MetabotPromptProps) => {
  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
    [onQueryChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onQuerySubmit();
      }
    },
    [onQuerySubmit],
  );

  return (
    <PromptSection>
      {user && <PromptUserAvatar user={user} />}
      <PromptInput
        value={query}
        placeholder={placeholder}
        fullWidth
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
      />
      {query.length > 0 ? (
        <PromptRunButton
          isRunning={isLoading}
          compact
          isDirty
          onRun={onQuerySubmit}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
