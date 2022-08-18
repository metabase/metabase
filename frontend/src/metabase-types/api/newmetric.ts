import { Aggregation, ConcreteField } from "metabase-types/types/Query";
import { CardId } from "metabase-types/api/card";

export type UnsavedMetric = Partial<Metric>;

export type Metric = {
  id: number;
  name: string;
  display_name: string;
  description: string;
  archived: boolean;
  card_id: CardId;
  measure: Aggregation;
  dimensions: [string, ConcreteField][];
  granularities: string[];
  default_granularity: string;
  creator_id: number;
  created_at: string;
  updated_at: string;
};
