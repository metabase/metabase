import { MouseEvent } from "react";
import { Column } from "metabase-types/types/Dataset";
import { formatValue } from "metabase/lib/formatting";

type VisualizationSettings = Record<string, unknown> & {
  column?: (col: Column) => Column;
};

export function formatValueForTooltip({
  value,
  column,
  settings,
}: {
  value?: unknown;
  column?: Column;
  settings?: VisualizationSettings;
}) {
  return formatValue(value, {
    ...(settings && settings.column && column
      ? settings.column(column)
      : { column }),
    type: "tooltip",
    majorWidth: 0,
  });
}

export function getEventTarget(event: MouseEvent) {
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
