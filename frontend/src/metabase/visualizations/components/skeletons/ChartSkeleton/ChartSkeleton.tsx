import { HTMLAttributes } from "react";
import AreaSkeleton from "../AreaSkeleton";
import BarSkeleton from "../BarSkeleton";
import EmptySkeleton from "../EmptySkeleton";
import FunnelSkeleton from "../FunnelSkeleton";
import GaugeSkeleton from "../GaugeSkeleton";
import LineSkeleton from "../LineSkeleton";
import MapSkeleton from "../MapSkeleton";
import PieSkeleton from "../PieSkeleton";
import ProgressSkeleton from "../ProgressSkeleton";
import RowSkeleton from "../RowSkeleton";
import ScalarSkeleton from "../ScalarSkeleton";
import ScatterSkeleton from "../ScatterSkeleton";
import SkeletonCaption from "../SkeletonCaption";
import SmartScalarSkeleton from "../SmartScalarSkeleton";
import TableSkeleton from "../TableSkeleton";
import WaterfallSkeleton from "../WaterfallSkeleton";

export interface ChartSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  display?: string | null;
  description?: string | null;
}

const ChartSkeleton = ({
  display,
  ...props
}: ChartSkeletonProps): JSX.Element => {
  if (!display) {
    return <EmptySkeleton {...props} />;
  }

  switch (display) {
    case "area":
      return <AreaSkeleton {...props} />;
    case "bar":
      return <BarSkeleton {...props} />;
    case "funnel":
      return <FunnelSkeleton {...props} />;
    case "gauge":
      return <GaugeSkeleton {...props} />;
    case "line":
      return <LineSkeleton {...props} />;
    case "map":
      return <MapSkeleton {...props} />;
    case "object":
    case "pivot":
    case "table":
      return <TableSkeleton {...props} />;
    case "pie":
      return <PieSkeleton {...props} />;
    case "progress":
      return <ProgressSkeleton {...props} />;
    case "row":
      return <RowSkeleton {...props} />;
    case "scalar":
      return <ScalarSkeleton {...props} />;
    case "scatter":
      return <ScatterSkeleton {...props} />;
    case "smartscalar":
      return <SmartScalarSkeleton {...props} />;
    case "waterfall":
      return <WaterfallSkeleton {...props} />;
    default:
      return <TableSkeleton {...props} />;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(ChartSkeleton, {
  Title: SkeletonCaption.Title,
  Description: SkeletonCaption.Description,
});
