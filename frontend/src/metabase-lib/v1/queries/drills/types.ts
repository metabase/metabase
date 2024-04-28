import type { ClickObject } from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { VisualizationSettings } from "metabase-types/api";

export type {
  ClickObject,
  ClickObjectDataRow,
  ClickObjectDimension,
} from "metabase-lib";

export type ClickActionProps = {
  question: Question;
  clicked?: ClickObject;
  settings?: VisualizationSettings;
  extraData?: Record<string, any>;
};
