import { useNavigate } from "react-router-dom";

import "./ViewToggle.css"

export const ViewToggle = () => {
  const navigate = useNavigate();

  return (
    <div>
      <button onClick={() => navigate("/app/questions")}>Questions</button>
      <button onClick={() => navigate("/app/dashboard")}>Dashboard</button>
    </div>
  );
};
