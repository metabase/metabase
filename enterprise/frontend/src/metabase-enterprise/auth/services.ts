import { DELETE } from "metabase/lib/api";

export const SamlApi = {
  deleteSettings: DELETE("/api/ee/auth/saml/settings"),
};

export const JwtApi = {
  deleteSettings: DELETE("/api/ee/auth/jwt/settings"),
};
