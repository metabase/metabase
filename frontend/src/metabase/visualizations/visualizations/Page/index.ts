import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import { ChartSettingTextarea } from "metabase/visualizations/components/settings/ChartSettingTextarea";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import { getDeduplicatedTableColumnSettings } from "metabase/visualizations/lib/settings/utils";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import {
  findColumnIndexesForColumnSettings,
  findColumnSettingIndexesForColumns,
} from "metabase-lib/v1/queries/utils/dataset";
import type { DatasetColumn } from "metabase-types/api";

import type {
  VisualizationDefinition,
  VisualizationSettingsDefinitions,
} from "../../types";

import { Page } from "./Page";
import { PageColumnPanel } from "./PageColumnPanel";

/**
 * Static visualization definition that is merged onto the Page component.
 * Follows the same pattern as ObjectDetail.tsx.
 */
const PageProperties: VisualizationDefinition = {
  getUiName() {
    return t`Page`;
  },
  identifier: "page",
  iconName: "document",
  get noun() {
    return t`page`;
  },
  minSize: getMinSize("page"),
  defaultSize: getDefaultSize("page"),
  hidden: false,
  canSavePng: false,
  disableClickBehavior: true,

  settings: {
    // Markdown template containing {{Column Display Name}} tokens.
    "page.template": {
      get section() {
        return t`Display`;
      },
      get title() {
        return t`Markdown template`;
      },
      widget: ChartSettingTextarea,
      getDefault: () => "",
      getProps: () => ({
        placeholder:
          "# {{Name}}\n\n**Total:** {{Total}}\n**Created At:** {{Created At}}",
        rows: 10,
      }),
    },
    // columnSettings provides the per-column formatting popover data.
    ...columnSettings({ hidden: true }),
    // "table.columns" drives the column list in the sidebar. We use our own
    // PageColumnPanel widget instead of ChartSettingTableColumns so that the
    // list is purely for formatting access — no drag handles, no show/hide.
    "table.columns": {
      get section() {
        return t`Columns`;
      },
      widget: PageColumnPanel,
      getHidden: () => false,
      getValue: ([{ data }], vizSettings) => {
        const { cols } = data;
        const settings = vizSettings["table.columns"] ?? [];
        const uniqColumnSettings = getDeduplicatedTableColumnSettings(settings);

        const columnIndexes = findColumnIndexesForColumnSettings(
          cols,
          uniqColumnSettings,
        );
        const settingIndexes = findColumnSettingIndexesForColumns(
          cols,
          uniqColumnSettings,
        );

        return [
          ...uniqColumnSettings.filter(
            (_, settingIndex) => columnIndexes[settingIndex] >= 0,
          ),
          ...cols
            .filter((_, columnIndex) => settingIndexes[columnIndex] < 0)
            .map((column) => ({
              name: column.name,
              enabled: true,
            })),
        ];
      },
      getProps: (series, settings) => {
        const [
          {
            data: { cols },
          },
        ] = series;
        return {
          columns: cols,
          isShowingDetailsOnlyColumns: true,
          getColumnName: (column: DatasetColumn) =>
            settings.column?.(column)?.column_title ??
            column.display_name ??
            column.name,
        };
      },
    },
  },

  /**
   * Per-column formatting settings, matching ObjectDetail so that number
   * formats, date formats, prefixes, suffixes, etc. are all available and
   * applied when substituting {{Column Name}} tokens.
   *
   * Tokens are matched by `display_name` (case-insensitive) — the same label
   * the user sees in table headers and in the conditional-formatting / link
   * widgets.
   */
  columnSettings: () => {
    const settings: VisualizationSettingsDefinitions = {
      column_title: {
        get title() {
          return t`Column title`;
        },
        widget: "input",
        getDefault: (column) => displayNameForColumn(column),
      },
      click_behavior: {},
      // Keep these so that formatValue can use them when rendering tokens
      view_as: { hidden: true },
      link_text: { hidden: true },
      link_url: { hidden: true },
    };
    return settings;
  },

  isSensible: () => true,
  checkRenderable: () => true,
};

const PageWithProperties = Object.assign(Page, PageProperties);

export { PageWithProperties as Page };
