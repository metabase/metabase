import { Dashboard } from "metabase-types/api";

export const createMockDashboard = (opts?: Partial<Dashboard>): Dashboard => ({
  id: 1,
  collection_id: null,
  name: "Dashboard",
  ordered_cards: [],
  can_write: true,
  description: "",
  cache_ttl: null,
  "last-edit-info": {
    id: 1,
    email: "admin@metabase.com",
    first_name: "John",
    last_name: "Doe",
    timestamp: "2018-01-01",
  },
  ...opts,
});
