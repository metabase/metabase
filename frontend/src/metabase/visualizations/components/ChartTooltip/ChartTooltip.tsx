import React, { useMemo, MouseEvent } from "react";
import Tooltip from "metabase/components/Tooltip";
import { Column } from "metabase-types/types/Dataset";
import { getFriendlyName } from "metabase/visualizations/lib/utils";
import { formatValueForTooltip, getEventTarget } from "./utils";

type VisualizationSettings = Record<string, unknown> & {
  column?: (col: Column) => Column;
};

type HoveredObject = {
  index?: number;
  axisIndex?: number;
  seriesIndex?: number;
  value?: unknown;
  column?: Column;
  data?: {
    key?: string;
    col?: Column;
    value: unknown;
  }[];
  dimensions?: {
    value: string;
    column: Column;
  }[];
  settings?: VisualizationSettings;
  element?: HTMLElement;
  event?: MouseEvent;
};

type ChartTooltipProps = {
  hovered?: HoveredObject;
  settings: VisualizationSettings;
};

export default function ChartTooltip({ hovered, settings }: ChartTooltipProps) {
  const rows = useMemo(() => {
    if (!hovered) {
      return [];
    }
    if (Array.isArray(hovered.data)) {
      return hovered.data.map(d => ({
        ...d,
        key: d.key || (d.col && getFriendlyName(d.col)),
      }));
    }
    if (hovered.value !== undefined || hovered.dimensions) {
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
  }, [hovered]);

  const hasTargetElement =
    hovered?.element != null && document.body.contains(hovered.element);
  const hasTargetEvent = hovered?.event != null;

  const isOpen = rows.length > 0 && (hasTargetElement || hasTargetEvent);

  let target;
  if (hasTargetElement) {
    target = hovered.element;
  } else if (hasTargetEvent) {
    target = getEventTarget(hovered.event as MouseEvent);
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

type TooltipRowProps = {
  name?: string;
  value?: any;
  column?: Column;
  settings: VisualizationSettings;
};

const TooltipRow = ({ name, value, column, settings }: TooltipRowProps) => (
  <tr>
    {name ? <td className="text-light text-right pr1">{name}:</td> : <td />}
    <td className="text-bold text-left">
      {React.isValidElement(value)
        ? value
        : formatValueForTooltip({ value, column, settings })}
    </td>
  </tr>
);
