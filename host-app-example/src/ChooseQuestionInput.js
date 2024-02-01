import { useState } from "react";

export const ChooseQuestionInput = ({
  questionId,
  setQuestionId,
  apiKey,
  setApiKey,
  font,
  setFont,
}) => {
  const [userInput, setTempQuestionId] = useState(questionId);
  const [userInput2, setTempApiKey] = useState(apiKey);

  const onChangeQuestionId = e => {
    if (e.key === "Enter") {
      setQuestionId(userInput);
    }
  };

  const onChangeApiKey = e => {
    if (e.key === "Enter") {
      setApiKey(userInput2);
    }
  };

  return (
    <div className="ChooseParams-container">
      <div>
        Question id:
        <input
          className="ChooseQuestion-input"
          value={userInput}
          onChange={e => setTempQuestionId(e.target.value)}
          onKeyDown={onChangeQuestionId}
        />
      </div>
      <div>
        ApiKey:
        <input
          className="ChooseQuestion-input"
          value={userInput2}
          onChange={e => setTempApiKey(e.target.value)}
          onKeyDown={onChangeApiKey}
        />
      </div>
      <div>
        Font:
        <select
          className="ChooseQuestion-input"
          value={font}
          onChange={e => setFont(e.target.value)}
        >
          <option value="Lato">Lato</option>
          <option value="Oswald">Oswald</option>
        </select>
      </div>

      <div className="Button align-self-end">I should be styless</div>
    </div>
  );
};
