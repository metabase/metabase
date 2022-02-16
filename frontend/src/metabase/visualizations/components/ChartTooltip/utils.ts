import { MouseEvent } from "react";
import { Column } from "metabase-types/types/Dataset";
import { formatValue } from "metabase/lib/formatting";
import { VisualizationSettings } from "./types";

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
