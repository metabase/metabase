import React from "react";

/* eslint-disable react/prop-types */
import { t } from "ttag";

import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import { updateSettings } from "metabase/visualizations/lib/settings";
import { keyForColumn } from "metabase/lib/dataset";

export default ({ question, clicked }) => {
  if (
    !clicked ||
    clicked.value !== undefined ||
    !clicked.column ||
    !question.query().isEditable()
  ) {
    return [];
  }
  const { column } = clicked;

  return [
    {
      name: "formatting",
      title: "Column formatting",
      section: "sort",
      buttonType: "formatting",
      icon: "gear",
      tooltip: t`Column formatting`,
      popover: ({ series, onChange }) => {
        const handleChangeSettings = changedSettings => {
          onChange(
            updateSettings(
              series[0].card.visualization_settings,
              changedSettings,
            ),
          );
        };

        const columnSettingsWidget = getSettingsWidgetsForSeries(
          series,
          handleChangeSettings,
          false,
        ).find(widget => widget.id === "column_settings");

        console.log(columnSettingsWidget, column);

        return (
          <div class="pt3">
            <ChartSettingsWidget
              key={columnSettingsWidget.id}
              {...{
                ...columnSettingsWidget,
                props: {
                  ...columnSettingsWidget.props,
                  initialKey: keyForColumn(column),
                },
              }}
              hidden={false}
            />
          </div>
        );
      },
      // action: () =>
      //   showChartSettings({
      //     widget: {
      //       id: "column_settings",
      //       props: { initialKey: keyForColumn(column) },
      //     },
      //   }),
    },
  ];
};
