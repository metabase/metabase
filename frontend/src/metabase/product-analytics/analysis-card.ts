import type { StoredSettings } from "metabase/event-tables";
import {
  type CardDisplayType,
  type CreateCardRequest,
  type DatasetQuery,
  PRODUCT_ANALYTICS_SETTINGS_KEY,
  type ProductAnalyticsDefinition,
  type TableId,
  type VisualizationSettings,
} from "metabase-types/api";

import type { AnalysisKind } from "./spec/types";

export type AnalysisCard = Pick<
  CreateCardRequest,
  "name" | "type" | "dataset_query" | "visualization_settings"
> & { display: CardDisplayType };

type BuildAnalysisCardArgs = {
  name: string;
  kind: AnalysisKind;
  tableId: TableId;
  stored: StoredSettings;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
  datasetQuery: DatasetQuery;
};

/**
 * An ordinary native question: the compiled SQL, plus the analysis definition
 * under one viz settings key so the builder can reopen it.
 */
export const buildAnalysisCard = ({
  name,
  kind,
  tableId,
  stored,
  display,
  vizSettings,
  datasetQuery,
}: BuildAnalysisCardArgs): AnalysisCard => {
  const definition: ProductAnalyticsDefinition = {
    version: 1,
    kind,
    table_id: tableId,
    settings: stored,
  };
  return {
    name,
    type: "question",
    display,
    dataset_query: datasetQuery,
    visualization_settings: {
      ...vizSettings,
      [PRODUCT_ANALYTICS_SETTINGS_KEY]: definition,
    },
  };
};
