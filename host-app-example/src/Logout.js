import { useNavigate } from "react-router-dom";
import { AUTH_API_HOST } from "./config";

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

  return <button onClick={onLogout}>Logout</button>;
};
