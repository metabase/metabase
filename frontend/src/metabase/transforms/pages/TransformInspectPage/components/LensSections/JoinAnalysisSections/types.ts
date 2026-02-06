import type {
  CardStats,
  TriggeredAlert,
  TriggeredDrillLens,
} from "metabase-lib/transforms-inspector";
import type { InspectorCard } from "metabase-types/api";

export type JoinTableRow = {
  id: string;
  card: InspectorCard;
  tableCard: InspectorCard | undefined;
  joinAlias: string;
  joinStrategy: string;
  alerts: TriggeredAlert[];
  severity: TriggeredAlert["severity"] | null;
  drillLenses: TriggeredDrillLens[];
  cardStats: CardStats | undefined;
};
