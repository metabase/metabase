import express from "express";
// [<snippet jsonwebtoken-import>]
import jwt from "jsonwebtoken";
// [<endsnippet jsonwebtoken-import>]

const app = express();

const METABASE_INSTANCE_URL = "YOUR_METABASE_URL_HERE";
const METABASE_JWT_SHARED_SECRET = "YOUR_SECRET_HERE";

type User = {
  email: string;
  firstName: string;
  lastName: string;
};

declare module "express-session" {
  interface SessionData {
    user: User;
  }
}

// [<snippet restrict-helper>]
function restrict(req, res, next) {
  if (req.session.user) {
    next();
  } else {
    req.session.returnTo = req.originalUrl;
    req.session.error = "Access denied!";
    res.redirect("/login");
  }
}
// [<endsnippet restrict-helper>]

// [<snippet sign-user-token-helper>]
const signUserToken = user =>
  jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minute expiration
    },
    METABASE_JWT_SHARED_SECRET,
  );
// [<endsnippet sign-user-token-helper>]

const userGroupsExample = () => {
  // [<snippet user-groups-sign-user-token-helper>]
  const signUserToken = user =>
    jwt.sign(
      {
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        groups: ["Customer-Acme"],
        exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minute expiration
      },
      METABASE_JWT_SHARED_SECRET,
    );
  // [<endsnippet user-groups-sign-user-token-helper>]
};

const userAttributeExample = () => {
  // [<snippet user-attribute-sign-user-token-helper>]
  const signUserToken = user =>
    jwt.sign(
      {
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        // hard-coded account ID added to this object
        // just to test sandboxing with Metabase's Sample Database: Invoices table
        account_id: 28,
        groups: ["Customer-Acme"],
        exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minute expiration
      },
      METABASE_JWT_SHARED_SECRET,
    );
  // [<endsnippet user-attribute-sign-user-token-helper>]
};

// [<snippet sso-route>]
app.get("/sso/metabase", restrict, (req, res) => {
  const ssoUrl = new URL("/auth/sso", METABASE_INSTANCE_URL);
  ssoUrl.searchParams.set("jwt", signUserToken(req.session.user));
  ssoUrl.searchParams.set("return_to", req.query.return_to?.toString() ?? "/");

  res.redirect(ssoUrl.href);
});
// [<endsnippet sso-route>]

app.get("/sso/metabase", restrict, (req, res) => {
  const ssoUrl = new URL("/auth/sso", METABASE_INSTANCE_URL);
  ssoUrl.searchParams.set("jwt", signUserToken(req.session.user));

  // [<snippet hide-metabase-elements>]
  ssoUrl.searchParams.set(
    "return_to",
    `${req.query.return_to ?? "/"}?logo=false&top_nav=false`,
  );
  // [<endsnippet hide-metabase-elements>]

  res.redirect(ssoUrl.href);
});

// [<snippet analytics-route>]
app.get("/analytics", restrict, (req, res) => {
  const METABASE_DASHBOARD_PATH = "/dashboard/entity/[Entity ID]"; // e.g., `/dashboard/1` or `/dashboard/entity/nXg0q7VOZJp5a3_hceMRk`
  const iframeUrl = `/sso/metabase?return_to=${METABASE_DASHBOARD_PATH}`;

  res.send(
    `<iframe src="${iframeUrl}" frameborder="0" width="1280" height="600" allowtransparency></iframe>`,
  );
});
// [<endsnippet analytics-route>]
