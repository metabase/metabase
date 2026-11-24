import type { GroupInfo, User } from "metabase-types/api";

export type PreviewTarget =
  | { kind: "user"; user: User }
  | { kind: "group"; group: GroupInfo };
