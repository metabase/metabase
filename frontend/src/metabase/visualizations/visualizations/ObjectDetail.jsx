import { t } from "ttag";

import { formatColumn } from "metabase/lib/formatting";
import ObjectDetail from "metabase/visualizations/components/ObjectDetail";
import {
  tableColumnSettings,
  columnSettings,
} from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

const ObjectDetailProperties = {
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
    ...tableColumnSettings,
  },
  columnSettings: column => {
    const settings = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: column => formatColumn(column),
      },
      click_behavior: {},
    };

    return settings;
  },
  isSensible: () => true,
};

export default Object.assign(ObjectDetail, ObjectDetailProperties);
