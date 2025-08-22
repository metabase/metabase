import { useMemo } from "react";
import { withRouter } from "react-router";
import { t } from "ttag";

import { displayNameForColumn } from "metabase/lib/formatting";
import type { OptionsType } from "metabase/lib/formatting/types";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { updateQuestion } from "metabase/query_builder/actions";
import {
  getIsListViewConfigurationShown,
  getQuestion,
} from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import ChartSettingLinkUrlInput from "metabase/visualizations/components/settings/ChartSettingLinkUrlInput";
import { columnSettings } from "metabase/visualizations/lib/settings/column";
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
import type { DatasetColumn } from "metabase-types/api";

import { ListView } from "../ListView/ListView";
import { ListViewConfiguration } from "../ListView/ListViewConfiguration";

const vizDefinition = {
  identifier: "list",
  iconName: "list",
  getUiName: () => t`List`,

  canSavePng: false,
  disableSettingsConfig: true,
  noHeader: true,
  hidden: true,
  supportPreviewing: false,

  checkRenderable: () => {},
  isSensible: () => true,

  settings: {
    ...columnSettings({ hidden: true }),
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

export const ListViz = withRouter(
  ({
    data,
    settings,
    onVisualizationClick,
    card,
    metadata,
    queryBuilderMode,
    ...props
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
    }: {
      left: string[];
      right: string[];
      entityIcon?: string;
    }) => {
      const newSettings = {
        viewSettings: {
          ...settings.viewSettings,
          listSettings: {
            leftColumns: left,
            rightColumns: right,
            entityIcon,
          },
        },
      };
      const nextQuestion = question?.updateSettings(newSettings);
      if (nextQuestion) {
        dispatch(updateQuestion(nextQuestion));
      }
    };

    return (
      <Box w="100%" h="100%" pos="absolute">
        {isShowingListViewConfiguration ? (
          <ListViewConfiguration
            data={data}
            settings={settings}
            entityType={entityType}
            onChange={updateListSettings}
          />
        ) : (
          <ListView
            data={data}
            settings={settings}
            sortedColumnName={sortedColumnName}
            sortingDirection={sortingDirection}
            onSortClick={handleSort}
            entityType={entityType}
            card={card}
            metadata={metadata}
            rowIndex={props.location.state?.rowIndex}
            isInteractive={queryBuilderMode !== "dataset"}
          />
        )}
      </Box>
    );
  },
);

Object.assign(ListViz, vizDefinition);
