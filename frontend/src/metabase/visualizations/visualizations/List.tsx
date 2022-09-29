import React, { useCallback } from "react";
import { t } from "ttag";
import _ from "lodash";

import { formatColumn } from "metabase/lib/formatting";
import {
  isNumber,
  isURL,
  isEmail,
  isImageURL,
  isAvatarURL,
} from "metabase/lib/schema_metadata";

import List from "metabase/visualizations/components/List/List";
import ChartSettingsListColumns from "metabase/visualizations/components/settings/ChartSettingsListColumns";
import { columnSettings } from "metabase/visualizations/lib/settings/column";

import { VisualizationSettings } from "metabase-types/api/card";
import { Column } from "metabase-types/types/Dataset";
import type { DatasetColumn } from "metabase-types/api/dataset";
import { Series, VisualizationProps } from "metabase-types/types/Visualization";

function ListViz(props: VisualizationProps) {
  const { data, settings } = props;

  const getColumnTitle = useCallback(
    (columnIndex: number) => {
      const column = data.cols[columnIndex];
      if (!column) {
        return null;
      }
      return (
        settings.column(column)["_column_title_full"] ||
        formatColumn(column as DatasetColumn)
      );
    },
    [data, settings],
  );

  if (!data) {
    return null;
  }

  return <List {...props} data={data} getColumnTitle={getColumnTitle} />;
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
    "buttons.edit": {
      section: t`Actions`,
      title: t`Edit button`,
      widget: "toggle",
      default: true,
    },
    "buttons.delete": {
      section: t`Actions`,
      title: t`Delete button`,
      widget: "toggle",
      default: true,
    },
    "actions.bulk_enabled": {
      section: t`Actions`,
      title: t`Bulk actions`,
      widget: "toggle",
      default: true,
    },
    "list.variant": {
      section: t`Options`,
      title: t`Variant`,
      widget: "radio",
      options: [
        { name: t`Basic`, value: "basic" },
        { name: t`Info`, value: "info" },
      ],
      default: "basic",
    },
    "list.columns": {
      section: t`Options`,
      title: t`Options`,
      widget: ChartSettingsListColumns,
      getDefault: ([
        {
          data: { cols },
        },
      ]: Series) => {
        const columns = cols.filter(
          col => col.visibility_type !== "details-only",
        );
        const firstThreeColumns = columns.slice(0, 3).filter(Boolean);
        const nextThreeColumns = columns.slice(3, 6).filter(Boolean);
        return {
          left: firstThreeColumns.map(col => col.id || col.field_ref),
          right: nextThreeColumns.map(col => col.id || col.field_ref),
        };
      },
      getProps: ([
        {
          data: { cols },
        },
      ]: Series) => ({
        columns: cols.filter(col => col.visibility_type !== "details-only"),
      }),
    },
  },

  columnSettings: (column: Column) => {
    const settings: VisualizationSettings = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column: Column) => formatColumn(column as DatasetColumn),
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
      props: {
        placeholder: t`Link to {{bird_id}}`,
      },
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: "input",
      hint: linkFieldsHint,
      default: null,
      getHidden: (_: unknown, settings: VisualizationSettings) =>
        settings["view_as"] !== "link",
      readDependencies: ["view_as"],
      props: {
        placeholder: t`http://toucan.example/{{bird_id}}`,
      },
    };

    return settings;
  },
});
