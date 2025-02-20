import type { CardId } from "./card";
import type { DashboardId } from "./dashboard";

export type AliasMapping = {
  name: string; // entity name
  alias: string; // alias name
} & ({
  model: "card", id: CardId
} | {
  model: "dashboard", id: DashboardId
});
