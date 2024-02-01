import { useState } from "react";
import {ChooseQuestionStyledInput} from "./ChooseQuestionInput.styled"

export const ChooseQuestionInput = ({ questionId, setQuestionId }) => {
  const [userInput, setTempQuestionId] = useState(questionId);

  const onChangeQuestionId = e => {
    if (e.key === "Enter") {
      setQuestionId(userInput);
    }
  };

  return (
    <div>
      Enter a question id:
      <ChooseQuestionStyledInput
      value={userInput}
      onChange={e => setTempQuestionId(e.target.value)}
      onKeyDown={onChangeQuestionId}
    />
    </div>
  );
};
