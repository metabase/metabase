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
  initialQuery?: string;
  isRunning?: boolean;
  onRun: (questionText: string) => void;
}

const MetabotPrompt = ({
  user,
  placeholder,
  initialQuery = "",
  isRunning = false,
  onRun,
}: MetabotPromptProps) => {
  const [query, setQuery] = useState(initialQuery);

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuery(event.target.value);
    },
    [],
  );

  const handleRunClick = useCallback(() => {
    onRun(query);
  }, [query, onRun]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onRun(query);
      }
    },
    [query, onRun],
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
          isRunning={isRunning}
          compact
          isDirty
          onRun={handleRunClick}
        />
      ) : null}
    </PromptSection>
  );
};

export default MetabotPrompt;
