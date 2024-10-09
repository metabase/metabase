import jwt from "jsonwebtoken";

export function signJwt({
  payload,
  secret,
}: {
  payload: Record<string, string | number>;
  secret: string;
}): string {
  return jwt.sign(payload, secret);
}
