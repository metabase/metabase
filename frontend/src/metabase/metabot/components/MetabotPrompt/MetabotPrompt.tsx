import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useState,
} from "react";
import { User } from "metabase-types/api";
import {
  PromptInput,
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotPrompt.styled";

export interface MetabotPromptProps {
  user?: User;
  placeholder?: string;
  isLoading?: boolean;
  initialQueryText?: string;
  onTextQuerySubmit: (queryText: string) => void;
}

const MetabotPrompt = ({
  user,
  placeholder,
  isLoading = false,
  initialQueryText = "",
  onTextQuerySubmit,
}: MetabotPromptProps) => {
  const [queryText, setQueryText] = useState(initialQueryText);

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQueryText(event.target.value);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onTextQuerySubmit(queryText);
      }
    },
    [queryText, onTextQuerySubmit],
  );

  const handleRunClick = useCallback(() => {
    onTextQuerySubmit(queryText);
  }, [queryText, onTextQuerySubmit]);

  return (
    <PromptSection>
      {user && <PromptUserAvatar user={user} />}
      <PromptInput
        value={queryText}
        placeholder={placeholder}
        fullWidth
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
      />
      {queryText.length > 0 ? (
        <PromptRunButton
          isRunning={isLoading}
          compact
          isDirty
          onRun={handleRunClick}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
