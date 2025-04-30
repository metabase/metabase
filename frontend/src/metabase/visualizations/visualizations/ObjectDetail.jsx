import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import ObjectDetail from "metabase/visualizations/components/ObjectDetail";
import {
  columnSettings,
  tableColumnSettings,
} from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

const ObjectDetailProperties = {
  getUiName() {
    return t`Detail`;
  },
  identifier: "object",
  iconName: "document",
  get noun() {
    return t`object`;
  },
  minSize: getMinSize("object"),
  defaultSize: getDefaultSize("object"),
  hidden: false,
  canSavePng: false,
  disableClickBehavior: true,
  settings: {
    ...columnSettings({ hidden: true }),
    ...tableColumnSettings,
  },
  columnSettings: (column) => {
    const settings = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column) => displayNameForColumn(column),
      },
      click_behavior: {},

      // Makes sure `column_settings` doesn't omit these settings,
      // so they can be used for formatting
      view_as: { hidden: true },
      link_text: { hidden: true },
      link_url: { hidden: true },
    };

    return settings;
  },
  isSensible: () => true,
};

export default Object.assign(ObjectDetail, ObjectDetailProperties);
