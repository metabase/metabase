import type { CardStats } from "metabase/transforms/lib/transforms-inspector";
import type {
  InspectorAlertTrigger,
  InspectorCard,
  InspectorDrillLensTrigger,
} from "metabase-types/api";

export type JoinTableRow = {
  id: string;
  card: InspectorCard;
  tableCard: InspectorCard | undefined;
  joinAlias: string;
  joinStrategy: string;
  alerts: InspectorAlertTrigger[];
  severity: InspectorAlertTrigger["severity"] | null;
  drillLenses: InspectorDrillLensTrigger[];
  cardStats: CardStats | undefined;
};
