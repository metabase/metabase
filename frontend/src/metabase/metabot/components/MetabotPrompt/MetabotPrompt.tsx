import React, { ChangeEvent, useCallback, useState } from "react";
import Input from "metabase/core/components/Input/Input";
import { User } from "metabase-types/api";
import {
  PromptRunButton,
  PromptSection,
  PromptUserAvatar,
} from "./MetabotPrompt.styled";

export interface MetabotPromptProps {
  user?: User;
  placeholder?: string;
  isRunning: boolean;
  onRun: (questionText: string) => void;
}

const MetabotPrompt = ({
  user,
  placeholder,
  isRunning,
  onRun,
}: MetabotPromptProps) => {
  const [questionText, setQuestionText] = useState("");

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setQuestionText(event.target.value);
    },
    [],
  );

  const handleRunClick = useCallback(() => {
    onRun(questionText);
  }, [questionText, onRun]);

  return (
    <PromptSection>
      {user && <PromptUserAvatar user={user} />}
      <Input
        value={questionText}
        placeholder={placeholder}
        fullWidth
        onChange={handleTextChange}
      />
      <PromptRunButton
        isRunning={isRunning}
        compact
        isDirty
        onRun={handleRunClick}
      />
    </PromptSection>
  );
};

export default MetabotPrompt;
