import type { VisualizationSettings } from "metabase-types/api";
import type Question from "metabase-lib/Question";
import type { ClickObject } from "metabase-lib/types";

export type {
  ClickObject,
  ClickObjectDataRow,
  ClickObjectDimension,
} from "metabase-lib/types";

export type ClickActionProps = {
  question: Question;
  clicked?: ClickObject;
  settings?: VisualizationSettings;
  extraData?: Record<string, any>;
};
