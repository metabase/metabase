import React, { Component } from "react";
import PropTypes from "prop-types";

import TooltipPopover from "metabase/components/TooltipPopover.jsx";
import Value from "metabase/components/Value.jsx";

import { getFriendlyName } from "metabase/visualizations/lib/utils";

export default class ChartTooltip extends Component {
  static propTypes = {
    series: PropTypes.array.isRequired,
    hovered: PropTypes.object,
  };

  _getRows() {
    const { series, hovered } = this.props;
    if (!hovered) {
      return [];
    }
    // Array of key, value, col: { data: [{ key, value, col }], element, event }
    if (Array.isArray(hovered.data)) {
      return hovered.data;
    } else if (hovered.value !== undefined || hovered.dimensions) {
      // ClickObject: { value, column, dimensions: [{ value, column }], element, event }
      const dimensions = [];
      if (hovered.value !== undefined) {
        dimensions.push({ value: hovered.value, column: hovered.column });
      }
      if (hovered.dimensions) {
        dimensions.push(...hovered.dimensions);
      }
      return dimensions.map(({ value, column }) => ({
        key: getFriendlyName(column),
        value: value,
        col: column,
      }));
    } else if (hovered.data) {
      // DEPRECATED: { key, value }
      console.warn(
        "hovered should be a ClickObject or hovered.data should be an array of { key, value, col }",
        hovered.data,
      );
      let s = series[hovered.index] || series[0];
      return [
        {
          key: getFriendlyName(s.data.cols[0]),
          value: hovered.data.key,
          col: s.data.cols[0],
        },
        {
          key: getFriendlyName(s.data.cols[1]),
          value: hovered.data.value,
          col: s.data.cols[1],
        },
      ];
    }
    return [];
  }

  render() {
    const { hovered } = this.props;
    const rows = this._getRows();
    const hasEventOrElement =
      hovered &&
      ((hovered.element && document.contains(hovered.element)) ||
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
              <TooltipRow key={index} name={key} value={value} column={col} />
            ))}
          </tbody>
        </table>
      </TooltipPopover>
    );
  }
}

const TooltipRow = ({ name, value, column }) => (
  <tr>
    <td className="text-light text-right">{name}:</td>
    <td className="pl1 text-bold text-left">
      {React.isValidElement(value) ? (
        value
      ) : (
        <Value type="tooltip" value={value} column={column} majorWidth={0} />
      )}
    </td>
  </tr>
);
