import { t } from "ttag";

import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import { updateSettings } from "metabase/visualizations/lib/settings";
import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import type {
  ClickActionPopoverProps,
  LegacyDrill,
} from "metabase/visualizations/types";
import * as Lib from "metabase-lib";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";
import type { VisualizationSettings } from "metabase-types/api";

import { PopoverRoot } from "./ColumnFormattingAction.styled";

export const POPOVER_TEST_ID = "column-formatting-settings";

export const ColumnFormattingAction: LegacyDrill = ({ question, clicked }) => {
  const { isEditable } = Lib.queryDisplayInfo(question.query());

  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.column ||
    clicked?.extraData?.isRawTable ||
    !isEditable
  ) {
    return [];
  }

  const { column } = clicked;

  const FormatPopover = ({
    series,
    onUpdateVisualizationSettings,
  }: ClickActionPopoverProps) => {
    const handleChangeSettings = (settings: VisualizationSettings) => {
      onUpdateVisualizationSettings(
        updateSettings(series[0].card.visualization_settings, settings),
      );
    };

    const widgets = getSettingsWidgetsForSeries(
      series,
      handleChangeSettings,
      false,
    );

    const columnSettingsWidget = widgets.find(
      widget => widget.id === "column_settings",
    );

    const extraProps = {
      ...columnSettingsWidget,
      props: {
        ...columnSettingsWidget.props,
        initialKey: getColumnKey(column),
      },
    };

    return (
      <PopoverRoot>
        <ChartSettingsWidget
          {...extraProps}
          key={columnSettingsWidget.id}
          hidden={false}
          dataTestId={POPOVER_TEST_ID}
        />
      </PopoverRoot>
    );
  };

  return [
    {
      name: "formatting",
      title: t`Column formatting`,
      section: "sort",
      buttonType: "sort",
      icon: "gear",
      tooltip: t`Column formatting`,
      popoverProps: {
        placement: "right-end",
        offset: [0, 20],
      },
      popover: FormatPopover,
    },
  ];
};
