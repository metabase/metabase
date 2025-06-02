import express from "express";
import cors from "cors";
import session from "express-session";
import jwt from "jsonwebtoken";

// Replace this with your Metabase URL
const METABASE_INSTANCE_URL = "YOUR_METABASE_URL_HERE";
// Replace this with the JWT signing secret you generated when enabling
// JWT SSO in your Metabase.
const METABASE_JWT_SHARED_SECRET = "YOUR_SECRET_HERE";

const app = express();

app.get("/sso/metabase", async (req, res) => {
  // This is an example endpoint that can handle both traditional interactive
  // embedding requests and SDK embedding requests.

  // Detect if the request is coming from the SDK by checking for the
  // 'response=json' query parameter added by the SDK.
  const isSDKRequest = req.query.response === "json";

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
    // Handle unauthenticated user
    if (isSDKRequest) {
      // For SDK requests, return a JSON error
      res.status(401).json({
        status: "error",
        message: "not authenticated",
      });
    } else {\n      // For traditional interactive embedding, you might redirect to a login page
      // or return an HTML page indicating unauthenticated state.
      res.status(401).send("User not authenticated");
    }
    return;
  }

  // Generate the JWT
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

  if (isSDKRequest) {
    // For SDK requests, return a JSON object with the JWT.
    res.status(200).json({ jwt: token });
  } else {
    // For traditional interactive embedding, construct the Metabase SSO URL
    // and redirect the user's browser to it.
    const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;
    res.redirect(ssoUrl);
  }
});

// Example usage (not part of the snippet, just for context)
// app.listen(3001, () => {
//   console.log('Backend listening on port 3001');
// }); 