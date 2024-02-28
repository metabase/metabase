import { useNavigate } from "react-router-dom";

import "./ViewToggle.css";

export const ViewToggle = () => {
  const navigate = useNavigate();

  return (
    <div className="tw-flex tw-flex-row tw-gap-2">
      <button
        className={[
          "ViewToggle--button",
          window.location.pathname.includes("questions") &&
            "ViewToggle--button--active",
        ].join(" ")}
        onClick={() => navigate("/app/questions")}
      >
        Questions
      </button>
      <button
        className={[
          "ViewToggle--button",
          window.location.pathname.includes("dashboard") &&
            "ViewToggle--button--active",
        ].join(" ")}
        onClick={() => navigate("/app/dashboard")}
      >
        Dashboard
      </button>
    </div>
  );
};
