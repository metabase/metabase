import { t } from "ttag";

import ObjectDetail from "metabase/visualizations/components/ObjectDetail";

import {
  buildTableColumnSettings,
  columnSettings,
} from "metabase/visualizations/lib/settings/column";

import { formatColumn } from "metabase/lib/formatting";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type { VisualizationProperties } from "metabase/visualizations/types";

const ObjectDetailProperties: VisualizationProperties = {
  uiName: t`Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
  minSize: getMinSize("object"),
  defaultSize: getDefaultSize("object"),
  hidden: false,
  canSavePng: false,
  disableClickBehavior: true,
  settings: {
    ...columnSettings({ hidden: true }),
    ...buildTableColumnSettings({ getIsColumnVisible: () => true }),
  },
  columnSettings: column => ({
    column_title: {
      title: t`Column title`,
      widget: "input",
      getDefault: column => formatColumn(column),
    },
    click_behavior: {},
  }),
  isSensible: () => true,
};

// eslint-disable-next-line import/no-default-export
export default Object.assign(ObjectDetail, ObjectDetailProperties);
