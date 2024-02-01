import { useState } from "react";

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
      <input class="ChooseQuestion-input"
        value={userInput}
        onChange={e => setTempQuestionId(e.target.value)}
        onKeyDown={onChangeQuestionId}
      />
    </div>
  );
};
