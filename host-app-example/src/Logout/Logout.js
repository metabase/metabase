import { useNavigate } from "react-router-dom";
import { AUTH_API_HOST } from "../config";
import { UserInfo } from "../UserInfo";
import { UserDropdown } from "../UserDropdown";

import "./Logout.css";

export const LogoutButton = () => {
  const navigate = useNavigate();

  const onLogout = e => {
    e.preventDefault();

    return fetch(`${AUTH_API_HOST}/logout`, {
      method: "GET",
    })
      .then(response => {
        console.log(response);
        if (response.status === 200) {
          console.log(response.status);
          navigate("/");
        }
      })
      .catch(error => {
        console.error("Error:", error);
      });
  };

  return (
    <div className="Logout--container">
      <UserInfo />
      <UserDropdown onClick={onLogout} />
    </div>
  );
};
