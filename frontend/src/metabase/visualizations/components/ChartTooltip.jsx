/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import Tooltip from "metabase/components/Tooltip";

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
      return hovered.data.map(d => ({
        ...d,
        key: d.key || (d.col && getFriendlyName(d.col)),
      }));
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
        key: column && getFriendlyName(column),
        value: value,
        col: column,
      }));
    }
    return [];
  }

  render() {
    const { hovered, settings } = this.props;
    const rows = this._getRows();

    const hasTargetElement =
      hovered?.element != null && document.body.contains(hovered.element);
    const hasTargetEvent = hovered?.event != null;

    const isOpen = rows.length > 0 && (hasTargetElement || hasTargetEvent);

    let target;
    if (hasTargetElement) {
      target = hovered.element;
    } else if (hasTargetEvent) {
      target = getEventTarget(hovered.event);
    }

    return target ? (
      <Tooltip
        reference={target}
        isOpen={isOpen}
        tooltip={
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
        }
        maxWidth="unset"
      />
    ) : null;
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

function getEventTarget(event) {
  let target = document.getElementById("popover-event-target");
  if (!target) {
    target = document.createElement("div");
    target.id = "popover-event-target";
    document.body.appendChild(target);
  }
  target.style.left = event.clientX - 3 + "px";
  target.style.top = event.clientY - 3 + "px";

  return target;
}
