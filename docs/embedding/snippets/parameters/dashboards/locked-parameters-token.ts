// [<snippet example>]
// Install via 'npm install jsonwebtoken'
const jwt = require("jsonwebtoken");

const METABASE_SECRET_KEY = "YOUR_METABASE_SECRET_KEY";

const payload = {
  resource: { dashboard: 10 },
  params: {
    // Keyed by slug. Values are arrays. Set this from your app's session, not from the page.
    customer_id: [13],
  },
  exp: Math.round(Date.now() / 1000) + 10 * 60, // 10 minute expiration
};

const token = jwt.sign(payload, METABASE_SECRET_KEY);
// [<endsnippet example>]

export { token };
