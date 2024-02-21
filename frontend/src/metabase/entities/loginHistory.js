import { createEntity } from "metabase/lib/entities";
import { LoginHistorySchema } from "metabase/schema";

const LoginHistory = createEntity({
  name: "loginHistory",
  path: "/api/login-history/current",
  schema: LoginHistorySchema,
});

export default LoginHistory;
