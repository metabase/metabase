import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AUTH_API_HOST } from "../config";

import "./SignIn.css"

export const SignIn = () => {
  const [authError, setAuthError] = useState(null);
  const navigate = useNavigate();

  const onSubmit = e => {
    e.preventDefault();
    const formData = new FormData(e.target);

    return fetch(`${AUTH_API_HOST}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: formData.get("email"),
        password: formData.get("password"),
      }),
      credentials: "include",
    })
      .then(response => {
        console.log(response);
        if (response.status === 200) {
          console.log(response.status);
          navigate("/app");
        } else {
          setAuthError("invalid");
        }
      })
      .catch(error => {
        console.error("Error:", error);
      });
  };

  return (
    <div className="SignIn--screen">
      <div className="SignIn--container">
        <h1>Sign In</h1>
        <form className="SignIn--form" onSubmit={onSubmit} action="#">
          <div>
            <label htmlFor="email">Email</label>
            <input
              className="SignIn--input"
              type="text"
              name="email"
              id="email"
            />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input
              className="SignIn--input"
              type="password"
              name="password"
              id="password"
            />
          </div>

          <button className="SignIn--submit" type="submit">
            Sign In
          </button>
        </form>

        {authError && <div>Invalid email or password</div>}
      </div>
    </div>
  );
};
