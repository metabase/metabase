import { LoginHistorySchema } from "metabase/schema";
import { createEntity } from "metabase/lib/entities";

const LoginHistory = createEntity({
  name: "loginHistory",
  path: "/api/login-history/current",
  schema: LoginHistorySchema,
});

export default LoginHistory;
