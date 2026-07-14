import type { LineSeriesOption } from "echarts/charts";
import type { MarkLine2DDataItemOption } from "echarts/types/src/component/marker/MarkLineModel";

// import individual icons instead of the full icon set to keep the
// static-viz bundle from pulling in every SVG through the barrel file
import bell_source from "metabase/ui/components/icons/Icon/icons/bell.svg?source";
import cake_source from "metabase/ui/components/icons/Icon/icons/birthday.svg?source";
import cloud_source from "metabase/ui/components/icons/Icon/icons/cloud.svg?source";
import mail_source from "metabase/ui/components/icons/Icon/icons/mail.svg?source";
import star_source from "metabase/ui/components/icons/Icon/icons/star.svg?source";
import warning_source from "metabase/ui/components/icons/Icon/icons/warning.svg?source";
import { CHART_STYLE } from "metabase/visualizations/echarts/cartesian/constants/style";
import type { TimelineEventsModel } from "metabase/visualizations/echarts/cartesian/timeline-events/types";
import type { RenderingContext } from "metabase/visualizations/types";
import type { TimelineEventId, TimelineIcon } from "metabase-types/api";

const TIMELINE_EVENT_ICON_SOURCES: Record<TimelineIcon, string> = {
  star: star_source,
  cake: cake_source,
  mail: mail_source,
  warning: warning_source,
  bell: bell_source,
  cloud: cloud_source,
};

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

export interface SplitPanelYExtent {
  topY: number;
  bottomY: number;
}

export const getTimelineEventsSeries = (
  timelineEventsModel: TimelineEventsModel,
  selectedEventsIds: TimelineEventId[],
  { fontFamily, getColor, theme }: RenderingContext,
  splitPanelYExtent?: SplitPanelYExtent,
): LineSeriesOption | null => {
  const { fontSize } = theme?.cartesian?.label ?? {};

  if (timelineEventsModel.length === 0) {
    return null;
  }

  const timelineEventsData = timelineEventsModel.map(({ date, events }) => {
    const isSelected = events.some((event) =>
      selectedEventsIds.includes(event.id),
    );

    const color = getColor(isSelected ? "core-brand" : "text-disabled");
    const iconName = events.length === 1 ? events[0].icon : "star";

    const iconSvg = setSvgColor(
      TIMELINE_EVENT_ICON_SOURCES[iconName] ?? star_source,
      color,
    );
    const dataUri = svgToImageUri(iconSvg);

    const itemProps = {
      name: TIMELINE_EVENT_DATA_NAME,
      symbolSize: 16,
      symbolOffset: [0, 12],
      symbolRotate: 0,
      symbol: dataUri,
      lineStyle: isSelected ? { color: getColor("core-brand") } : undefined,
      label: {
        show: events.length > 1,
        formatter: () => String(events.length),
        position: "start" as const,
        padding: [0, 0, 0, 24],
        hideOverlap: true,
        color,
        fontSize,
        fontWeight: CHART_STYLE.axisTicks.weight,
        fontFamily,
      },
    };

    if (splitPanelYExtent) {
      const markLineData: MarkLine2DDataItemOption = [
        { ...itemProps, xAxis: date, y: splitPanelYExtent.bottomY },
        { xAxis: date, y: splitPanelYExtent.topY, symbol: "none" },
      ];
      return markLineData;
    }

    return { ...itemProps, xAxis: date };
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
          color: getColor("core-brand"),
        },
        label: {
          color: getColor("core-brand"),
        },
        itemStyle: {
          color: getColor("core-brand"),
        },
      },
      symbol: "none",
      lineStyle: {
        type: "solid",
        // eslint-disable-next-line metabase/no-color-literals
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
