import React, {
  ChangeEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
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
  isRunning: boolean;
  onRun: (questionText: string) => void;
  initialPrompt?: string;
}

const MetabotPrompt = ({
  initialPrompt,
  user,
  placeholder,
  isRunning,
  onRun,
}: MetabotPromptProps) => {
  const [questionText, setQuestionText] = useState(initialPrompt ?? "");

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuestionText(event.target.value);
    },
    [],
  );

  const handleRunClick = useCallback(() => {
    onRun(questionText);
  }, [questionText, onRun]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        onRun(questionText);
      }
    },
    [questionText, onRun],
  );

  useEffect(() => {
    if (questionText.length > 0) {
      onRun(questionText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PromptSection>
      {user && <PromptUserAvatar user={user} />}
      <PromptInput
        defaultValue={initialPrompt}
        value={questionText}
        placeholder={placeholder}
        fullWidth
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
      />
      {questionText.length > 0 ? (
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
