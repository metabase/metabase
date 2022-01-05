import { Dashboard } from "metabase-types/api";

export const createDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  name: "Dashboard",
  ...opts,
});
