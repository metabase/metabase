import { t } from "ttag";

import { color } from "metabase/ui/utils/colors";
import { displayNameForColumn } from "metabase/value-formatting";
import {
  type ColumnSettingDefinition,
  type FormattableColumn,
  type VisualizationDefinition,
  columnSettings,
  getDefaultSize,
  getMinSize,
} from "metabase/viz-core";
import * as Lib from "metabase-lib";
import {
  isAvatarURL,
  isCoordinate,
  isEmail,
  isImageURL,
  isNumber,
  isString,
  isURL,
} from "metabase-lib/v1/types/utils/isa";
import type { ColumnSettings, Series } from "metabase-types/api";

export const LIST_DEFINITION: VisualizationDefinition = {
  identifier: "list",
  iconName: "list",
  getUiName: () => t`List`,
  hidden: true,

  minSize: getMinSize("list"),
  defaultSize: getDefaultSize("list"),
  checkRenderable: () => {},
  isSensible: () => true,

  settings: {
    ...columnSettings({ getHidden: () => true }),
    "list.entity_icon": {
      getDefault: () => null,
    },
    "list.entity_icon_color": {
      getDefault: () => color("text-primary"),
    },
    "list.entity_icon_enabled": {
      getDefault: () => true,
    },
    "list.use_image_column": {
      getDefault: () => false,
    },
    "list.columns": {
      getDefault: ([
        {
          data: { cols },
        },
      ]: Series) => {
        const defaultTitleColumn =
          cols.find((col) => Lib.isEntityName(Lib.legacyColumnTypeInfo(col))) ||
          cols.find((col) => Lib.isTitle(Lib.legacyColumnTypeInfo(col))) ||
          cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col))) ||
          cols[0];
        const defaultSubtitleColumn =
          defaultTitleColumn &&
          Lib.isID(Lib.legacyColumnTypeInfo(defaultTitleColumn))
            ? null
            : cols.find((col) => Lib.isID(Lib.legacyColumnTypeInfo(col)));

        const imageColumn = cols.find(
          (col) =>
            Lib.isAvatarURL(Lib.legacyColumnTypeInfo(col)) ||
            Lib.isImageURL(Lib.legacyColumnTypeInfo(col)),
        );

        const usedColumns = new Set(
          [defaultTitleColumn, defaultSubtitleColumn, imageColumn].filter(
            Boolean,
          ),
        );

        const defaultRightColumns = cols
          .filter((col) => !usedColumns.has(col))
          .slice(0, 4)
          .map((col) => col?.name);

        return {
          left: [defaultTitleColumn, defaultSubtitleColumn]
            .filter(Boolean)
            .map((col) => col?.name),
          right: defaultRightColumns,
          image: imageColumn?.name,
        };
      },
    },
  },

  // TODO Unify with the same code in Table viz
  columnSettings: (column: FormattableColumn) => {
    const settings: Record<
      string,
      ColumnSettingDefinition<unknown, unknown>
    > = {
      column_title: {
        title: t`Column title`,
        widget: "input",
        getDefault: (column) => displayNameForColumn(column),
      },
      click_behavior: {},
      text_align: {
        title: t`Align`,
        widget: "select",
        getDefault: (column) => {
          const baseColumn = column?.remapped_to_column ?? column;
          return isNumber(baseColumn) || isCoordinate(baseColumn)
            ? "right"
            : "left";
        },
        props: {
          options: [
            { name: t`Left`, value: "left" },
            { name: t`Right`, value: "right" },
            { name: t`Middle`, value: "middle" },
          ],
        },
      },
    };

    if (isNumber(column)) {
      settings["show_mini_bar"] = {
        title: t`Show a mini bar chart`,
        widget: "toggle",
        inline: true,
      };
    }

    if (isString(column)) {
      const canWrapText = (columnSettings: ColumnSettings) =>
        columnSettings["view_as"] !== "image";

      settings["text_wrapping"] = {
        title: t`Wrap text`,
        getDefault: () => false,
        widget: "toggle",
        inline: true,
        isValid: (_column, columnSettings) => {
          return canWrapText(columnSettings);
        },
        getHidden: (_column, columnSettings) => {
          return !canWrapText(columnSettings);
        },
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
        getDefault: () => defaultValue,
        props: {
          options,
        },
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: "linkUrlInput",
      hint: linkFieldsHint,
      getDefault: () => null,
      getHidden: (_, settings) =>
        settings["view_as"] !== "link" && settings["view_as"] !== "email_link",
      readDependencies: ["view_as"],
      getProps: (
        column,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map((column) => column.name),
          placeholder: t`Link to {{bird_id}}`,
        };
      },
    };

    settings["link_url"] = {
      title: t`Link URL`,
      widget: "linkUrlInput",
      hint: linkFieldsHint,
      getDefault: () => null,
      getHidden: (_, settings) => settings["view_as"] !== "link",
      readDependencies: ["view_as"],
      getProps: (
        column,
        settings,
        onChange,
        {
          series: [
            {
              data: { cols },
            },
          ],
        },
      ) => {
        return {
          options: cols.map((column) => column.name),
          placeholder: t`http://toucan.example/{{bird_id}}`,
        };
      },
    };

    return settings;
  },
};
