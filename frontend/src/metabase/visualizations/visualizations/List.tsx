import React, { useLayoutEffect, useCallback, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "lodash";
import cx from "classnames";

import { findColumnIndexForColumnSetting } from "metabase/lib/dataset";
import { formatColumn } from "metabase/lib/formatting";
import {
  isNumber,
  isURL,
  isEmail,
  isImageURL,
  isAvatarURL,
} from "metabase/lib/schema_metadata";

import { usePrevious } from "metabase/hooks/use-previous";
import { useOnMount } from "metabase/hooks/use-on-mount";

import List from "metabase/visualizations/components/List/List";
import ChartSettingOrderedColumns from "metabase/visualizations/components/settings/ChartSettingOrderedColumns";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { VisualizationSettings } from "metabase-types/types/Card";
import { Column, DatasetData } from "metabase-types/types/Dataset";
import { Series, VisualizationProps } from "metabase-types/types/Visualization";
import { Field, FieldLiteral } from "metabase-types/types/Query";

type ColumnSetting = {
  fieldRef: Field | FieldLiteral;
  enabled: boolean;
};

function ListViz(props: VisualizationProps) {
  const { data, series, settings, isDashboard } = props;

  const [formattedData, setFormattedData] = useState<DatasetData | null>(null);
  const previousSeries = usePrevious(series);
  const previousSettings = usePrevious(settings);

  const formatData = useCallback(() => {
    const { cols, rows } = data;

    const columnSettings = settings["table.columns"] as ColumnSetting[];
    const columnIndexes = columnSettings
      .filter(columnSetting => columnSetting.enabled)
      .map(columnSetting =>
        findColumnIndexForColumnSetting(cols, columnSetting),
      )
      .filter(columnIndex => columnIndex >= 0 && columnIndex < cols.length);

    setFormattedData({
      cols: columnIndexes.map(i => cols[i]),
      rows: rows.map(row => columnIndexes.map(i => row[i])),
    });
  }, [data, settings]);

  const areAllColumnsHidden = useMemo(() => {
    const columnSettings = settings["table.columns"] || [];
    return !columnSettings.some(
      (columnSetting: { enabled?: boolean }) => columnSetting.enabled,
    );
  }, [settings]);

  const getColumnTitle = useCallback(
    (columnIndex: number) => {
      const columns = formattedData?.cols || [];
      const column = columns[columnIndex];
      if (!column) {
        return null;
      }
      return (
        settings.column(column)["_column_title_full"] || formatColumn(column)
      );
    },
    [formattedData, settings],
  );

  useOnMount(() => {
    formatData();
  });

  useLayoutEffect(() => {
    if (series !== previousSeries || !_.isEqual(settings, previousSeries)) {
      formatData();
    }
  }, [series, settings, previousSeries, previousSettings, formatData]);

  if (!formattedData) {
    return null;
  }

  if (areAllColumnsHidden) {
    return (
      <div
        className={cx(
          "flex-full px1 pb1 text-centered flex flex-column layout-centered",
          { "text-slate-light": isDashboard, "text-slate": !isDashboard },
        )}
      >
        <img
          width={99}
          src="app/assets/img/hidden-field.png"
          srcSet="
            app/assets/img/hidden-field.png     1x,
            app/assets/img/hidden-field@2x.png  2x
          "
          className="mb2"
        />
        <span className="h4 text-bold">{t`Every field is hidden right now`}</span>
      </div>
    );
  }

  return (
    <List {...props} data={formattedData} getColumnTitle={getColumnTitle} />
  );
}

export default Object.assign(ListViz, {
  uiName: t`List`,
  identifier: "list",
  iconName: "list",

  minSize: {
    width: 4,
    height: 3,
  },

  isSensible: () => true,
  isLiveResizable: () => false,

  checkRenderable: _.noop,

  settings: {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    ...columnSettings({ hidden: true }),
    "table.columns": {
      section: t`Columns`,
      title: t`Visible columns`,
      widget: ChartSettingOrderedColumns,
      getHidden: (series: Series, vizSettings: VisualizationSettings) =>
        vizSettings["table.pivot"],
      isValid: ([{ card, data }]: Series) => {
        const tableColumns = card.visualization_settings["table.columns"] || [];
        const columnSettings = tableColumns as ColumnSetting[];
        // If "table.columns" happened to be an empty array,
        // it will be treated as "all columns are hidden",
        // This check ensures it's not empty,
        // otherwise it will be overwritten by `getDefault` below
        return (
          columnSettings.length !== 0 &&
          columnSettings.every(
            columnSetting =>
              findColumnIndexForColumnSetting(data.cols, columnSetting) >= 0,
          )
        );
      },
      getDefault: ([
        {
          data: { cols },
        },
      ]: Series) =>
        cols.map(col => ({
          name: col.name,
          fieldRef: col.field_ref,
          enabled: col.visibility_type !== "details-only",
        })),
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        columns: cols,
      }),
    },
    "table.column_widths": {},
  },

  columnSettings: (column: Column) => {
    const settings: VisualizationSettings = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column: Column) => formatColumn(column),
      },
      click_behavior: {},
    };
    if (isNumber(column)) {
      settings["show_mini_bar"] = {
        title: t`Show a mini bar chart`,
        widget: "toggle",
      };
    }

    let defaultValue = !column.semantic_type || isURL(column) ? "link" : null;

    const options = [
      { name: t`Text`, value: null },
      { name: t`Link`, value: "link" },
    ];

    if (!column.semantic_type || isEmail(column)) {
      defaultValue = "email_link";
      options.push({ name: t`Email link`, value: "email_link" });
    }
    if (!column.semantic_type || isImageURL(column) || isAvatarURL(column)) {
      defaultValue = isAvatarURL(column) ? "image" : "link";
      options.push({ name: t`Image`, value: "image" });
    }
    if (!column.semantic_type) {
      defaultValue = "auto";
      options.push({ name: t`Automatic`, value: "auto" });
    }

    if (options.length > 1) {
      settings["view_as"] = {
        title: t`Display as`,
        widget: options.length === 2 ? "radio" : "select",
        default: defaultValue,
        props: {
          options,
        },
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: "input",
      hint: linkFieldsHint,
      default: null,
      getHidden: (_: unknown, settings: VisualizationSettings) =>
        settings["view_as"] !== "link" && settings["view_as"] !== "email_link",
      readDependencies: ["view_as"],
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: "input",
      hint: linkFieldsHint,
      default: null,
      getHidden: (_: unknown, settings: VisualizationSettings) =>
        settings["view_as"] !== "link",
      readDependencies: ["view_as"],
    };

    return settings;
  },
});
