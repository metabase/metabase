import { t } from "ttag";

import ObjectDetail from "metabase/visualizations/components/ObjectDetail";

import {
  columnSettings,
  tableColumnSettings,
} from "metabase/visualizations/lib/settings/column";

import { formatColumn } from "metabase/lib/formatting";

const ObjectDetailProperties = {
  uiName: t`Detail`,
  identifier: "object",
  iconName: "document",
  noun: t`object`,
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
