import { sample } from "underscore";

import { HARDCODED_JWT_SHARED_SECRET } from "../constants/config";
import { HARDCODED_USERS } from "../constants/hardcoded-users";
import type { CliState } from "../types/cli";

type Options = Pick<CliState, "instanceUrl" | "tenantIdsMap">;

const DEFAULT_EXPRESS_SERVER_PORT = 4477;

export const getExpressServerSnippet = (options: Options) => {
  const { tenantIdsMap, instanceUrl } = options;

  const users = HARDCODED_USERS.map((user, i) => {
    const tenancyAttributes: Record<string, string | number> = {};

    // Assign one of the tenant id in the user's database to their Metabase user attributes.
    // This is hard-coded for demonstration purposes.
    for (const tenancyColumnName in tenantIdsMap) {
      const tenantIds = tenantIdsMap[tenancyColumnName];
      let tenantId = tenantIds[i];

      // If there isn't enough tenants, we sample a tenant.
      if (tenantId === undefined) {
        tenantId = sample(tenantIds) ?? 0;
      }

      tenancyAttributes[tenancyColumnName] = tenantId;
    }

    return { ...user, ...tenancyAttributes };
  });

  let tenancyAttributeMaps = "";

  for (const tenancyColumnName in tenantIdsMap) {
    tenancyAttributeMaps += `      ${tenancyColumnName}: user.${tenancyColumnName},\n`;
  }

  return `
const express = require("express");
const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const session = require('express-session')
const cors = require('cors')

const PORT = process.env.PORT || ${DEFAULT_EXPRESS_SERVER_PORT}

const METABASE_INSTANCE_URL = '${instanceUrl}'

const METABASE_JWT_SHARED_SECRET =
  '${HARDCODED_JWT_SHARED_SECRET}'

const USERS = ${JSON.stringify(users, null, 2)}

const getUser = (email) => USERS.find((user) => user.email === email)

async function metabaseAuthHandler(req, res) {
  const { user } = req.session;

  if (!user) {
    return res.status(401).json({
      status: "error",
      message: "not authenticated",
    });
  }

  const token = jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: user.groups,
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
${tenancyAttributeMaps}
    },
    // This is the JWT signing secret in your Metabase JWT authentication setting
    METABASE_JWT_SHARED_SECRET,
  );

  const ssoUrl = \`\${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=\${token}\`;

  try {
    const response = await fetch(ssoUrl, { method: "GET" });
    const token = await response.json();

    return res.status(200).json(token);
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({
        status: "error",
        message: "authentication failed",
        error: error.message,
      });
    }
  }
}

async function switchUserHandler(req, res) {
  const {email} = req.body

  const user = getUser(email)

  if (!user) {
    return res
      .status(401)
      .json({status: 'error', message: 'unknown user', email})
  }

  if (req.session.email === email) {
    return res.status(200).json({message: 'already logged in', user})
  }

  req.session.regenerate(() => {
    req.session.user = user
    res.status(200).json({user})
  })
}

const app = express();

// Middleware

// If your FE application is on a different domain from your BE, you need to enable CORS
// by setting Access-Control-Allow-Credentials to true and Access-Control-Allow-Origin
// to your FE application URL.
app.use(
  cors({
    credentials: true,
    origin: true,
  }),
);

app.use(
  session({
    secret: 'session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }),
);

app.use(express.json());

// routes
app.get('/', (_, res) => res.send({ok: true}))
app.get("/sso/metabase", metabaseAuthHandler);
app.post('/switch-user', switchUserHandler)
app.listen(PORT, () => {
  console.log(\`API running at http://localhost:\${PORT}\`);
});
`;
};
