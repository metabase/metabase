import { DELETE } from "metabase/lib/api";

export const SamlApi = {
  deleteSettings: DELETE("/api/saml/settings"),
};

export const JwtApi = {
  deleteSettings: DELETE("/api/jwt/settings"),
};
