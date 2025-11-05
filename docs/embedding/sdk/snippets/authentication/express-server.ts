import express from "express";
import cors from "cors";
import session from "express-session";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

// Replace this with your Metabase URL
const METABASE_INSTANCE_URL = "YOUR_METABASE_URL_HERE";
// Replace this with the JWT signing secret you generated when enabling
// JWT SSO in your Metabase.
const METABASE_JWT_SHARED_SECRET = "YOUR_SECRET_HERE";

const app = express();

app.get("/sso/metabase", async (req, res) => {
  // Usually, you would grab the user from the current session
  // Here it's hardcoded for demonstration purposes
  // Example:
  // const { user } = req.session;
  const user = {
    email: "rene@example.com",
    firstName: "Rene",
    lastName: "Descartes",
    group: "Customer",
  };

  if (!user) {
    console.log("no user");
    res.status(401).json({
      status: "error",
      message: "not authenticated",
    });

    return;
  }

  const token = jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: [user.group],
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
    },
    METABASE_JWT_SHARED_SECRET,
  );
  // The user backend should return a JSON object with the JWT.
  res.status(200).json({ jwt: token });
});
