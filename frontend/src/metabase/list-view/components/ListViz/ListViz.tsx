import cx from "classnames";
import { useMemo } from "react";
import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import {
  getIsListViewConfigurationShown,
  getQuestion,
} from "metabase/query_builder/selectors";
import { Box, type IconName } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";
import ChartSettingLinkUrlInput from "metabase/visualizations/components/settings/ChartSettingLinkUrlInput";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
import {
  getDefaultSize,
  getMinSize,
} from "metabase/visualizations/shared/utils/sizes";
import type {
  ColumnSettingDefinition,
  VisualizationProps,
} from "metabase/visualizations/types";
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
import type { DatasetColumn, Series } from "metabase-types/api";

import { ListView } from "../ListView/ListView";
import { ListViewConfiguration } from "../ListView/ListViewConfiguration";

import S from "./ListViz.module.css";

const vizDefinition = {
  identifier: "list",
  iconName: "list",
  getUiName: () => t`List`,
  hidden: true,

  minSize: getMinSize("list"),
  defaultSize: getDefaultSize("list"),
  checkRenderable: () => {},
  getSensibility: () => "sensible" as const,

  settings: {
    ...columnSettings({ hidden: true }),
    "list.entity_icon": {
      default: null,
    },
    "list.entity_icon_color": {
      default: color("text-primary"),
    },
    "list.entity_icon_enabled": {
      default: true,
    },
    "list.use_image_column": {
      default: false,
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
  columnSettings: (column: DatasetColumn) => {
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
      const canWrapText = (columnSettings: OptionsType) =>
        columnSettings["view_as"] !== "image";

      settings["text_wrapping"] = {
        title: t`Wrap text`,
        default: false,
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
        default: defaultValue,
        props: {
          options,
        },
      };
    }

    const linkFieldsHint = t`You can use the value of any column here like this: {{COLUMN}}`;

    settings["link_text"] = {
      title: t`Link text`,
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      default: null,
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
      widget: ChartSettingLinkUrlInput,
      hint: linkFieldsHint,
      default: null,
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

export const ListViz = ({
  data,
  settings,
  onVisualizationClick,
  queryBuilderMode,
  isDashboard,
}: VisualizationProps) => {
  const dispatch = useDispatch();
  const question = useSelector(getQuestion);
  const isShowingListViewConfiguration = useSelector(
    getIsListViewConfigurationShown,
  );
  const { sortedColumnName, sortingDirection } = useMemo(() => {
    if (!question) {
      return {};
    }
    const query = question.query();
    const [orderBy] = Lib.orderBys(query, -1);
    if (orderBy) {
      const { name, direction } = Lib.displayInfo(query, -1, orderBy);
      return {
        sortedColumnName: name,
        sortingDirection: direction,
      };
    }
    return {};
  }, [question]);

  const columnsMetadata = useMemo(() => {
    if (!question) {
      return [];
    }
    const query = question.query();
    return data.cols.map((col) => Lib.fromLegacyColumn(query, -1, col));
  }, [data, question]);

  // Get the entity type from the question's source table
  const entityType = useMemo(() => {
    if (!question) {
      return undefined;
    }

    try {
      const query = question.query();
      const sourceTableId = Lib.sourceTableOrCardId(query);
      const metadata = question.metadata();
      const table = metadata.table(sourceTableId);

      // Return the entity type if available, otherwise undefined
      // Use type assertion since entity_type exists in the database but not in TypeScript types
      return (table as any)?.entity_type;
    } catch (error) {
      // If there's an error getting the entity type, return undefined
      console.warn("Could not determine entity type:", error);
      return undefined;
    }
  }, [question]);

  const handleSort = (column: DatasetColumn) => {
    onVisualizationClick({ column });
  };
  const updateListSettings = ({
    left,
    right,
    entityIcon,
    entityIconColor,
    entityIconEnabled,
    useImageColumn,
  }: {
    left?: string[];
    right?: string[];
    entityIcon?: IconName | null;
    entityIconColor?: string;
    entityIconEnabled?: boolean;
    useImageColumn?: boolean;
  }) => {
    const settings = { ...(question?.settings() || {}) };
    if (left && right) {
      settings["list.columns"] = {
        left,
        right,
      };
    }
    if (entityIcon !== undefined) {
      settings["list.entity_icon"] = entityIcon;
    }
    if (entityIconColor !== undefined) {
      settings["list.entity_icon_color"] = entityIconColor;
    }
    if (entityIconEnabled !== undefined) {
      settings["list.entity_icon_enabled"] = entityIconEnabled;
    }
    if (useImageColumn !== undefined) {
      settings["list.use_image_column"] = useImageColumn;
    }

    const nextQuestion = question?.updateSettings(settings);
    if (nextQuestion) {
      dispatch(updateQuestion(nextQuestion));
    }
  };

  return (
    <Box
      w="100%"
      pos="absolute"
      className={cx(S.ListViz, {
        [S.listViewDashcard]: isDashboard,
      })}
    >
      {isShowingListViewConfiguration ? (
        <ListViewConfiguration
          data={data}
          settings={settings}
          onChange={updateListSettings}
          entityType={entityType}
          columnsMetadata={columnsMetadata}
        />
      ) : (
        <ListView
          className={isDashboard ? S.dashboardListView : undefined}
          data={data}
          settings={settings}
          sortedColumnName={sortedColumnName}
          sortingDirection={sortingDirection}
          onSortClick={handleSort}
          entityType={entityType}
          isInteractive={queryBuilderMode !== "dataset"}
        />
      )}
    </Box>
  );
};

Object.assign(ListViz, vizDefinition);
