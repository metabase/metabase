import { useNavigate } from "react-router-dom";

import "./ViewToggle.css";

export const ViewToggle = () => {
  const navigate = useNavigate();

  const getClasses = path => {
    return [
      "ViewToggle--button",
      window.location.pathname.includes(path) && "ViewToggle--button--active",
    ].join(" ");
  };

  return (
    <div className="tw-flex tw-flex-row tw-gap-2">
      <button
        className={getClasses("questions")}
        onClick={() => navigate("/app/questions")}
      >
        Questions
      </button>
      <button
        className={getClasses("dashboard")}
        onClick={() => navigate("/app/dashboard")}
      >
        Dashboard
      </button>

      <button className={getClasses("question-iframe")}
        onClick={() => navigate("/app/question-iframe")}
      >Question IFrame</button>
    </div>
  );
};
