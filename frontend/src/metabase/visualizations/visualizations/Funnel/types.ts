import type { RowValue } from "metabase-types/api";

export type FunnelRow = {
  key: RowValue;
  name: RowValue;
  enabled: boolean;
};
