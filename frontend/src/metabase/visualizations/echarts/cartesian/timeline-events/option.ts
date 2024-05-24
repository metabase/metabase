import type { LineSeriesOption } from "echarts/charts";
import type { MarkLine1DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";

import type { IconName } from "metabase/ui/components/icons/Icon/icons";
import { Icons } from "metabase/ui/components/icons/Icon/icons";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { RenderingContext } from "metabase/visualizations/types";
import type { TimelineEventId } from "metabase-types/api";

import {
  TIMELINE_EVENT_DATA_NAME,
  TIMELINE_EVENT_SERIES_ID,
} from "../constants/dataset";

// TODO: change to GraalVM supported implementation
export const setSvgColor = (svgString: string, color: string) => {
  // Parse the SVG string into a DOM element
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const svg = doc.documentElement;

  // Set the color attribute of the SVG
  svg.setAttribute("color", color);

  // Serialize the SVG back to a string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svg);
};

export function svgToDataUri(svgString: string) {
  const base64Encoded = btoa(svgString);
  return `data:image/svg+xml;base64,${base64Encoded}`;
}

function svgToImageUri(svgString: string) {
  return `image://${svgToDataUri(svgString)}`;
}

export const getTimelineEventsSeries = (
  timelineEventsModel: TimelineEventsModel,
  selectedEventsIds: TimelineEventId[],
  { fontFamily, getColor }: RenderingContext,
): LineSeriesOption | null => {
  if (timelineEventsModel.length === 0) {
    return null;
  }

  const timelineEventsData: MarkLine1DDataItemOption[] =
    timelineEventsModel.map(({ date, events }) => {
      const isSelected = events.some(event =>
        selectedEventsIds.includes(event.id),
      );

      const color = getColor(isSelected ? "brand" : "text-light");
      const iconName =
        events.length === 1 ? (events[0].icon as IconName) : "star";

      const iconSvg = setSvgColor(Icons[iconName].source, color);
      const dataUri = svgToImageUri(iconSvg);

      return {
        name: TIMELINE_EVENT_DATA_NAME,
        xAxis: date,
        symbolSize: 16,
        symbolOffset: [0, 12],
        symbolRotate: 0,
        symbol: dataUri,
        lineStyle: isSelected ? { color: getColor("brand") } : undefined,
        label: {
          show: events.length > 1,
          formatter: () => String(events.length),
          position: "start",
          padding: [0, 0, 0, 24],
          hideOverlap: true,
          color,
          fontSize: CHART_STYLE.axisTicks.size,
          fontWeight: CHART_STYLE.axisTicks.weight,
          fontFamily,
        },
      };
    });

  return {
    id: TIMELINE_EVENT_SERIES_ID,
    animation: false,
    type: "line",
    data: [],
    markLine: {
      blur: {
        label: {
          opacity: 1,
        },
        itemStyle: {
          opacity: 1,
        },
        lineStyle: {
          opacity: 1,
        },
      },
      emphasis: {
        lineStyle: {
          color: getColor("brand"),
        },
        label: {
          color: getColor("brand"),
        },
        itemStyle: {
          color: getColor("brand"),
        },
      },
      symbol: "none",
      lineStyle: {
        type: "solid",
        color: "rgba(105, 110, 123, 0.2)",
        width: 2,
      },
      label: {
        show: false,
      },
      data: timelineEventsData,
    },
  };
};
