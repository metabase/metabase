/* eslint-disable no-undef */
const http = require("http");
const jwt = require("jsonwebtoken");
const url = require("url");
const querystring = require("querystring");

// this could be a `npx @metabase/sample-jwt-sso xxx yyy` command
// for now it's used like this: `METABASE_SITE_URL=http://localhost:3000 METABASE_EMBEDDING_SECRET=0000000000000000000000000000000000000000000000000000000000000000 node index.js`

const throwMessage = (msg) => {
  throw new Error(msg);
};
const METABASE_SITE_URL =
  process.env.METABASE_SITE_URL || throwMessage("METABASE_SITE_URL is not set");
const METABASE_EMBEDDING_SECRET =
  process.env.METABASE_EMBEDDING_SECRET ||
  throwMessage("METABASE_EMBEDDING_SECRET is not set");
const PORT = process.env.PORT || "8888";

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  if (req.method === "GET") {
    const clientReturnTo = parsedUrl.query.return_to;
    const finalReturnTo = clientReturnTo || "/";

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    // eslint-disable-next-line -- x
    res.end(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Metabase Embedding JWT Provider</title>
                    <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; background-color: #f0f2f5; color: #1c1e21; margin: 0; padding: 20px; box-sizing: border-box; }
                        .container { background-color: #fff; padding: 25px 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1), 0 8px 16px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
                        h1 { color: #1877f2; text-align: center; margin-bottom: 25px; font-size: 24px; }
                        label { display: block; margin-bottom: 6px; font-weight: 600; color: #606770; }
                        input[type="text"], input[type="email"] { width: 100%; padding: 12px; margin-bottom: 15px; border: 1px solid #dddfe2; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
                        input[type="text"]:focus, input[type="email"]:focus { border-color: #1877f2; box-shadow: 0 0 0 2px #e7f3ff; outline: none; }
                        input[type="submit"] { background-color: #1877f2; color: white; padding: 12px 20px; border: none; border-radius: 6px; cursor: pointer; font-size: 17px; font-weight: bold; width: 100%; }
                        input[type="submit"]:hover { background-color: #166fe5; }
                        .error-message { color: #fa383e; background-color: #ffebe6; border: 1px solid #fa383e; padding: 10px; border-radius: 6px; text-align: center; margin-bottom: 15px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>Metabase Embedding JWT Provider</h1>
                        <form method="POST">
                            <input type="hidden" name="return_to" value="${encodeURIComponent(finalReturnTo)}">
                            <div>
                                <label for="firstName">First Name:</label>
                                <input type="text" id="firstName" name="firstName" value="Test" required>
                            </div>
                            <div>
                                <label for="lastName">Last Name:</label>
                                <input type="text" id="lastName" name="lastName" value="User" required>
                            </div>
                            <div>
                                <label for="email">Email:</label>
                                <input type="email" id="email" name="email" value="test@test.com" required>
                            </div>
                            <input type="submit" value="Login & Redirect to Metabase">
                        </form>
                    </div>
                </body>
                </html>
            `);
  } else if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      const formData = querystring.parse(body);

      const firstName = formData.firstName ? String(formData.firstName) : null;
      const lastName = formData.lastName ? String(formData.lastName) : null;
      const email = formData.email ? String(formData.email) : null;
      const formReturnTo = formData.return_to
        ? decodeURIComponent(String(formData.return_to))
        : "/";

      if (!firstName || !lastName || !email) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        // Provide a simple error message, user will see the form again on refresh or GET
        res.end(`
                    <div class="container">
                        <p class="error-message">First Name, Last Name, and Email are required. Please try again.</p>
                        <a href="${parsedUrl.pathname}?return_to=${encodeURIComponent(formReturnTo)}">Back to form</a>
                    </div>
                `);
        return;
      }

      const payload = {
        email: email,
        first_name: firstName,
        last_name: lastName,
        exp: Math.floor(Date.now() / 1000) + 60 * 10 * 9999999,
      };

      console.log("payload", payload);

      const token = jwt.sign(payload, METABASE_EMBEDDING_SECRET);

      const metabaseAuthUrl = `${METABASE_SITE_URL}/auth/sso?jwt=${token}&return_to=${encodeURIComponent(formReturnTo)}`;

      console.log("metabaseAuthUrl", metabaseAuthUrl);

      res.writeHead(302, { Location: metabaseAuthUrl });
      res.end();
    });
  } else {
    // Should not be reached if only GET/POST are expected
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
  }
});

server.listen(PORT, () => {
  console.log(`JWT Provider Server listening on port ${PORT}`);
  console.log(`Access via any path, e.g., http://localhost:${PORT}/`);
  // eslint-disable-next-line no-literal-metabase-strings -- Sample app, this is an informative console message not subject to whitelabeling
  console.log(
    "--- Provider will use 'return_to' query parameter if present (defaults to '/') ---",
  );
  // eslint-disable-next-line no-literal-metabase-strings -- Sample app, this is an informative console message not subject to whitelabeling
  console.log("Metabase JWT Provider Configuration:");
  console.log(`  METABASE_SITE_URL: ${METABASE_SITE_URL}`);
  console.log(`  METABASE_EMBEDDING_SECRET: [${METABASE_EMBEDDING_SECRET}]`);
  console.log("---");
});

process.on("SIGINT", () => {
  console.log("\nGracefully shutting down from SIGINT (Ctrl-C)");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
});
