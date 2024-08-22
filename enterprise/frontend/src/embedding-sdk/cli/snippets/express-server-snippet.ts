import { HARDCODED_USERS } from "embedding-sdk/cli/constants/hardcoded-users";

import {
  HARDCODED_JWT_SHARED_SECRET,
  USER_ATTRIBUTE_CUSTOMER_ID,
} from "../constants/config";

interface Options {
  instanceUrl: string;
  tenantIds: number[];
}

const DEFAULT_EXPRESS_SERVER_PORT = 4477;

export const getExpressServerSnippet = (options: Options) => {
  const users = HARDCODED_USERS.map((user, i) => ({
    ...user,

    // Assign one of the tenant id in the user's database to their Metabase user attributes.
    // This is hard-coded for demonstration purposes.
    ...(options.tenantIds[i] && {
      [USER_ATTRIBUTE_CUSTOMER_ID]: options.tenantIds[i],
    }),
  }));

  return `
const express = require('express')
const jwt = require('jsonwebtoken')
const cors = require('cors')
const session = require('express-session')

const PORT = process.env.PORT || ${DEFAULT_EXPRESS_SERVER_PORT}

const METABASE_INSTANCE_URL = '${options.instanceUrl}'

const METABASE_JWT_SHARED_SECRET =
  '${HARDCODED_JWT_SHARED_SECRET}'

const USERS = ${JSON.stringify(users, null, 2)}

const getUser = (email) => USERS.find((user) => user.email === email)

const signUserToken = (user) =>
  jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: user.groups,
      customer_id: user.customerId,
      exp: Math.round(Date.now() / 1000) + 60 * 0.25,
    },
    METABASE_JWT_SHARED_SECRET
  )

const sessionConfig = {
  name: 'session',
  resave: false,
  saveUninitialized: true,
  secret: 'session-secret',
}

const app = express()
app.use(express.json())
app.use(express.text())
app.use(express.urlencoded({extended: false}))
app.use(cors({credentials: true, origin: true}))
app.use(session(sessionConfig))

app.get('/', (_, res) => res.send({ok: true}))

app.get('/sso/metabase', async (req, res) => {
  if (!req.sessionID || !req.session) {
    return res.status(401).json({
      status: 'error',
      message: 'not logged in',
    })
  }

  const {email} = req.session
  const user = getUser(email)

  if (!user) {
    return res
      .status(401)
      .json({status: 'error', message: 'no user in session', email})
  }

  const ssoUrl = new URL('/auth/sso', METABASE_INSTANCE_URL)
  ssoUrl.searchParams.set('jwt', signUserToken(user))
  ssoUrl.searchParams.set('token', 'true')

  try {
    const ssoResponse = await fetch(ssoUrl, {method: 'GET'})
    const ssoResponseText = await ssoResponse.text()

    if (ssoResponseText.includes('SSO has not been enabled')) {
      return res
        .status(500)
        .json({status: 'error', message: 'SSO has not been enabled'})
    }

    if (!ssoResponse.ok) {
      return res.status(500).json({status: 'error', message: ssoResponseText})
    }

    const token = JSON.parse(ssoResponseText)

    return res.status(200).json(token)
  } catch (error) {
    if (error instanceof Error) {
      res.status(401).json({
        status: 'error',
        message: 'auth failed',
        error: error.message,
        session: req.session,
      })
    }
  }
})

app.post('/switch-user', (req, res) => {
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
    req.session.email = email
    res.status(200).json({user})
  })
})

app.listen(PORT, async () => {
  console.log(\`[mock sso api] running at http://localhost:\${PORT}\`)
})
`;
};
