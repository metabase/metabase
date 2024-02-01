import { useState } from "react";

export const ChooseQuestionInput = ({ apiKey, setApiKey, font, setFont }) => {
  const [userInput2, setTempApiKey] = useState(apiKey);

  const onChangeApiKey = e => {
    if (e.key === "Enter") {
      setApiKey(userInput2);
    }
  };

  return (
    <div className="ChooseParamsHeader-container">
      <div className="Params-container">
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
      </div>

      <div
        className="Button align-self-end"
        style={{
          fontSize: "0.5rem",
        }}
      >
        I should not have border
      </div>
    </div>
  );
};
