import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import MarkdownDetail from "metabase/visualizations/components/MarkdownDetail";
import MarkdownTemplateWidget from "metabase/visualizations/components/MarkdownTemplateWidget";
import {
  columnSettings,
  tableColumnSettings,
} from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";

const MarkdownDetailProperties = {
  getUiName() {
    return t`Markdown`;
  },
  identifier: "markdown",
  iconName: "document",
  get noun() {
    return t`markdown`;
  },
  minSize: getMinSize("markdown"),
  defaultSize: getDefaultSize("markdown"),
  hidden: false,
  canSavePng: false,
  disableClickBehavior: true,
  settings: {
    "markdown.template": {
      section: t`Display`,
      title: t`Markdown Template`,
      widget: MarkdownTemplateWidget,
      default: `# Data Summary

**Rows:** {{row_count}}
**Columns:** {{col_count}}

**Available Variables:**
- {{title}} - Table title
- {{row_count}} - Number of rows  
- {{col_count}} - Number of columns
- Column values from first row available by column name`,
      placeholder: t`Enter your markdown template using {{variable_name}} syntax...`,
    },
    ...columnSettings({ hidden: true }),
    ...tableColumnSettings,
  },
  columnSettings: (column) => {
    const settings = {
      column_title: {
        title: t`Column Reference`,
        widget: "input",
        getDefault: (column) => column.name.toLowerCase().replace(/\s+/g, '_'),
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

export default Object.assign(MarkdownDetail, MarkdownDetailProperties);