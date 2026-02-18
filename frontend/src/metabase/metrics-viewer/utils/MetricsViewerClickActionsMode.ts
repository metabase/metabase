import dayjs from "dayjs";

import type {
  ClickObject,
  CustomClickAction,
} from "metabase/visualizations/types";
import type { TemporalUnit } from "metabase-types/api";

import type {
  MetricsViewerDefinitionEntry,
  MetricsViewerTabState,
} from "../types/viewer-state";

type MetricsViewerClickActionParams = {
  definitions: MetricsViewerDefinitionEntry[];
  tab: MetricsViewerTabState;
  onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
};

export class MetricsViewerClickActionsMode {
  private definitions: MetricsViewerDefinitionEntry[];
  private tab: MetricsViewerTabState;
  private onTabUpdate: (updates: Partial<MetricsViewerTabState>) => void;
  constructor({
    definitions,
    tab,
    onTabUpdate,
  }: MetricsViewerClickActionParams) {
    this.definitions = definitions;
    this.tab = tab;
    this.onTabUpdate = onTabUpdate;
  }
  actionsForClick(clickObject: ClickObject): CustomClickAction[] {
    const params = {
      definitions: this.definitions,
      tab: this.tab,
      onTabUpdate: this.onTabUpdate,
      clickObject,
    };
    return [getZoomInTimeSeriesAction(params)].filter(
      (action) => action !== undefined,
    );
  }
}

type GetActionParams = MetricsViewerClickActionParams & {
  clickObject: ClickObject;
};

function getZoomInTimeSeriesAction({
  definitions,
  tab,
  onTabUpdate,
  clickObject,
}: GetActionParams): CustomClickAction | undefined {
  if (tab.type !== "time") {
    return;
  }
  const definition = definitions.find((d) => d.definition != null)?.definition;
  if (!definition) {
    return;
  }
  const currentTemporalUnit = tab.projectionTemporalUnit ?? "month"; // todo defaultTemporalBucket then displayInfo
  const nextTemporalUnit = getNextTemporalUnit(currentTemporalUnit);
  if (!nextTemporalUnit) {
    return;
  }
  const dimensionValue = clickObject.dimensions?.[0]?.value; // todo is using first dimension always correct?
  if (typeof dimensionValue !== "string") {
    return;
  }
  const currentDate = new Date(dimensionValue);
  const temporalUnitRange = getTemporalUnitRange(
    currentDate,
    currentTemporalUnit,
  );
  if (!temporalUnitRange) {
    return;
  }
  return {
    type: "custom",
    name: "zoom-in.timeseries",
    title: `See this ${currentTemporalUnit} by ${nextTemporalUnit}`,
    section: "zoom",
    icon: "zoom_in",
    buttonType: "horizontal",
    onClick: ({ closePopover }) => {
      onTabUpdate({
        projectionTemporalUnit: nextTemporalUnit,
        filter: {
          type: "specific",
          operator: "between",
          values: [temporalUnitRange.start, temporalUnitRange.end],
          hasTime: true, // todo?
        },
      });
      closePopover();
    },
  };
}

// todo move to utils/dates.ts?
function getTemporalUnitRange(
  date: Date,
  unit: TemporalUnit,
): { start: Date; end: Date } | undefined {
  const d = dayjs(date);
  switch (unit) {
    case "year":
      return {
        start: d.startOf("year").toDate(),
        end: d.endOf("year").startOf("day").toDate(),
      };
    case "quarter":
      return {
        start: d.startOf("quarter").toDate(),
        end: d.endOf("quarter").startOf("day").toDate(),
      };
    case "month":
      return {
        start: d.startOf("month").toDate(),
        end: d.endOf("month").startOf("day").toDate(),
      };
    case "week":
      return {
        start: d.startOf("week").toDate(),
        end: d.endOf("week").startOf("day").toDate(),
      };
    case "day":
      return {
        start: d.startOf("day").toDate(),
        end: d.add(1, "day").startOf("day").toDate(),
      };
    case "hour":
      return {
        start: d.startOf("hour").toDate(),
        end: d.add(1, "hour").startOf("hour").toDate(),
      };
    default:
      return undefined;
  }
}

// todo should this be a lib function?
function getNextTemporalUnit(
  currentUnit: TemporalUnit,
): TemporalUnit | undefined {
  // todo availableTemporalBuckets then displayInfo
  switch (currentUnit) {
    case "year":
      return "quarter";
    case "quarter":
      return "month";
    case "month":
      return "week";
    case "week":
      return "day";
    case "day":
      return "hour";
    case "hour":
      return "minute";
    default:
      return undefined;
  }
}
