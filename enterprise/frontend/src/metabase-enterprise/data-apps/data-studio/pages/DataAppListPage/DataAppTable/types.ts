import type { DataApp } from "metabase-types/api";

export type DataAppRow = DataApp & {
  address: string;
  statusLabel: string;
};
