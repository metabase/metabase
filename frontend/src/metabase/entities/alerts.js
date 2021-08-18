import { createEntity } from "metabase/lib/entities";

const Alerts = createEntity({
  name: "alerts",
  path: "/api/alert",
});

export default Alerts;
