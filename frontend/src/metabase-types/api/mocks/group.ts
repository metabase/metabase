// [
//   { id: 2, name: "Administrators", member_count: 1 },
//   { id: 1, name: "All Users", member_count: 1 },
// ];

import { Group } from "metabase-types/api";

export const createMockGroup = (
  opts?: Partial<Group>,
): Omit<Group, "members"> => ({
  id: 1,
  name: "All Users",
  member_count: 1,
  ...opts,
});
