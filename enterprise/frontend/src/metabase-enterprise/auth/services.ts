import { DELETE } from "metabase/lib/api";

export const JwtApi = {
  deleteSettings: DELETE("/api/jwt/settings"),
};
