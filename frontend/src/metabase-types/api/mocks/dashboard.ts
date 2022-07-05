import { Dashboard } from "metabase-types/api";

export const createMockDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  name: "Dashboard",
  ordered_cards: [],
  can_write: true,
  description: "",
  cache_ttl: null,
  ...opts,
});
