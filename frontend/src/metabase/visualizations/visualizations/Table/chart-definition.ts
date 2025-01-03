import { t } from "ttag";

import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

import TableLegacy from "../TableLegacy";

export const TABLE_DEFINITION = {
  uiName: t`Table New`,
  identifier: "table",
  iconName: "table",
  noun: t`table`,
  minSize: getMinSize("table"),
  defaultSize: getDefaultSize("table"),
  settings: TableLegacy.settings,
};
