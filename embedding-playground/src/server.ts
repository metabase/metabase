import http from "http";
import jwt from "jsonwebtoken";

// you'll need to set this in your Metabase instance in the JWT settings page
// remember to press the save button at the bottom of the page, we usually save on blur but not here
const METABASE_JWT_SHARED_SECRET =
  "0000000000000000000000000000000000000000000000000000000000000000";
const METABASE_INSTANCE_URL = "http://localhost:3000";

const server = http.createServer(async (req, res) => {
  // Allow CORS
  console.log("request received", req.method, req.url);
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "*");

  res.setHeader("Access-Control-Allow-Credentials", "true");

  if (req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
  }

  // Continue with the rest of your code
  if (req.url?.startsWith("/api/sso") && req.method === "GET") {
    ssoHandler(req, res);
  } else {
    console.log("Request got, returning 200 ok bye");
    res.statusCode = 200;
    res.end();
  }
});

async function ssoHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage> & {
    req: http.IncomingMessage;
  },
) {
  console.log("SSO request received!");

  const url = new URL(req.url || "", `http://${req.headers.host}`);
  const returnTo = url.searchParams.get("return_to");

  // In a real application, you'd pull the user from your session / auth context.

  const randomSlug = Math.random().toString(36).substring(2, 10);
  const user = {
    // email: "test@example.org", // if you want always the same user
    email: `test-${randomSlug}@example.org`, // if you want a new user each time
    first_name: "SDK USER",
    last_name: "Smith",
    customer_jwt_attribute: "test1",
    // tenant: "test1", // uncomment this line to add a tenant
  };

  console.log("user", user);

  const token = jwt.sign(
    {
      ...user,
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10-minute expiration
    },
    METABASE_JWT_SHARED_SECRET,
  );

  // Interactive embedding: redirect to Metabase with JWT and return_to
  if (returnTo) {
    const redirectUrl = `${METABASE_INSTANCE_URL}/auth/sso?jwt=${token}&return_to=${returnTo}`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    return;
  }

  // SDK (iframe) embedding: return JSON response with JWT
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jwt: token }));
  return;
}

const port = process.env.PORT || 8888;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
