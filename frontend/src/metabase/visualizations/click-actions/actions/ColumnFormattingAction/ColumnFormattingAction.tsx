import { Fragment } from "react";
import { t } from "ttag";

import { Box } from "metabase/ui";
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
      if (!series) {
        return;
      }

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
      (widget) => widget.id === "column_settings",
    );

    const { id, ...extraProps } = {
      ...columnSettingsWidget,
      props: {
        ...columnSettingsWidget?.props,
        initialKey: getColumnKey(column),
      },
    };

    if (!columnSettingsWidget || id == null) {
      return <Fragment />;
    }

    return (
      <Box pt="lg" mah={600} style={{ overflowY: "auto" }}>
        <ChartSettingsWidget
          {...extraProps}
          id={id}
          key={columnSettingsWidget?.id}
          hidden={false}
          dataTestId={POPOVER_TEST_ID}
        />
      </Box>
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
        position: "right-start",
        offset: 20,
      },
      popover: FormatPopover,
    },
  ];
};
