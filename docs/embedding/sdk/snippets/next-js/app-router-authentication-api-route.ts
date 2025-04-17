// [<snippet imports>]
import jwt from "jsonwebtoken";
// [<endsnippet imports>]

const user = {
  email: "rene@example.com",
  firstName: "Rene",
  lastName: "Descartes",
  group: "Customer",
};

// [<snippet example>]
const METABASE_JWT_SHARED_SECRET = process.env.METABASE_JWT_SHARED_SECRET || "";
const METABASE_INSTANCE_URL = process.env.METABASE_INSTANCE_URL || "";

export async function GET() {
  const token = jwt.sign(
    {
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      groups: [user.group],
      exp: Math.round(Date.now() / 1000) + 60 * 10, // 10 minutes expiration
    },
    // This is the JWT signing secret in your Metabase JWT authentication setting
    METABASE_JWT_SHARED_SECRET,
  );
  const ssoUrl = `${METABASE_INSTANCE_URL}/auth/sso?token=true&jwt=${token}`;

  try {
    const ssoResponse = await fetch(ssoUrl, { method: "GET" });
    const ssoResponseBody = await ssoResponse.json();

    return Response.json(ssoResponseBody);
  } catch (error) {
    if (error instanceof Error) {
      return Response.json(
        {
          status: "error",
          message: "authentication failed",
          error: error.message,
        },
        {
          status: 401,
        },
      );
    }
  }
}
// [<endsnippet example>]
