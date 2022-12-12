import React from "react";
import styled from "@emotion/styled";

/* eslint-disable react/prop-types */
import { t } from "ttag";

import { getSettingsWidgetsForSeries } from "metabase/visualizations/lib/settings/visualization";
import ChartSettingsWidget from "metabase/visualizations/components/ChartSettingsWidget";
import { updateSettings } from "metabase/visualizations/lib/settings";
import { getColumnKey } from "metabase-lib/queries/utils/get-column-key";

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
      popoverProps: {
        placement: "right-end",
        offset: [0, 20],
      },
      popover: function FormatPopover({ series, onChange }) {
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

        return (
          <PopoverRoot>
            <ChartSettingsWidget
              key={columnSettingsWidget.id}
              {...{
                ...columnSettingsWidget,
                props: {
                  ...columnSettingsWidget.props,
                  initialKey: getColumnKey(column),
                },
              }}
              hidden={false}
            />
          </PopoverRoot>
        );
      },
    },
  ];
};

const PopoverRoot = styled.div`
  padding-top: 1.5rem;
  max-height: 600px;
  overflow-y: auto;
`;
