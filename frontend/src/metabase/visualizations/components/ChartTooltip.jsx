import React, { Component } from "react";
import PropTypes from "prop-types";

import TooltipPopover from "metabase/components/TooltipPopover";

import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { formatValue } from "metabase/lib/formatting";

export default class ChartTooltip extends Component {
  static propTypes = {
    hovered: PropTypes.object,
    settings: PropTypes.object,
  };

  _getRows() {
    const { hovered } = this.props;
    if (!hovered) {
      return [];
    }
    if (Array.isArray(hovered.data)) {
      // Array of key, value, col: { data: [{ key, value, col }], element, event }
      return hovered.data;
    } else if (hovered.value !== undefined || hovered.dimensions) {
      // ClickObject: { value, column, dimensions: [{ value, column }], element, event }
      const dimensions = [];
      if (hovered.dimensions) {
        dimensions.push(...hovered.dimensions);
      }
      if (hovered.value !== undefined) {
        dimensions.push({ value: hovered.value, column: hovered.column });
      }
      return dimensions.map(({ value, column }) => ({
        key: getFriendlyName(column),
        value: value,
        col: column,
      }));
    }
    return [];
  }

  render() {
    const { hovered, settings } = this.props;
    const rows = this._getRows();
    const hasEventOrElement =
      hovered &&
      ((hovered.element && document.body.contains(hovered.element)) ||
        hovered.event);
    const isOpen = rows.length > 0 && !!hasEventOrElement;
    return (
      <TooltipPopover
        target={hovered && hovered.element}
        targetEvent={hovered && hovered.event}
        verticalAttachments={["bottom", "top"]}
        isOpen={isOpen}
      >
        <table className="py1 px2">
          <tbody>
            {rows.map(({ key, value, col }, index) => (
              <TooltipRow
                key={index}
                name={key}
                value={value}
                column={col}
                settings={settings}
              />
            ))}
          </tbody>
        </table>
      </TooltipPopover>
    );
  }
}

const TooltipRow = ({ name, value, column, settings }) => (
  <tr>
    {name ? <td className="text-light text-right pr1">{name}:</td> : <td />}
    <td className="text-bold text-left">
      {React.isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings })}
    </td>
  </tr>
);

// only exported for testing, so leaving this here rather than a formatting file
export function formatValueForTooltip({ value, column, settings }) {
  return formatValue(value, {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  });
}
