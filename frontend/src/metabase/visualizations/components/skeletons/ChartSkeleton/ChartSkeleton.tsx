import { HTMLAttributes } from "react";
import EmptySkeleton from "metabase/visualizations/components/skeletons/EmptySkeleton";
import AreaSkeleton from "metabase/visualizations/components/skeletons/AreaSkeleton";
import FunnelSkeleton from "metabase/visualizations/components/skeletons/FunnelSkeleton";
import LineSkeleton from "metabase/visualizations/components/skeletons/LineSkeleton";
import GaugeSkeleton from "metabase/visualizations/components/skeletons/GaugeSkeleton";
import MapSkeleton from "metabase/visualizations/components/skeletons/MapSkeleton";
import BarSkeleton from "metabase/visualizations/components/skeletons/BarSkeleton";
import TableSkeleton from "metabase/visualizations/components/skeletons/TableSkeleton";
import PieSkeleton from "metabase/visualizations/components/skeletons/PieSkeleton";
import ProgressSkeleton from "metabase/visualizations/components/skeletons/ProgressSkeleton";
import RowSkeleton from "metabase/visualizations/components/skeletons/RowSkeleton";
import ScatterSkeleton from "metabase/visualizations/components/skeletons/ScatterSkeleton";
import WaterfallSkeleton from "metabase/visualizations/components/skeletons/WaterfallSkeleton";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption";
import { VisualizationSkeleton } from "metabase/visualizations/components/skeletons/VisualizationSkeleton/VisualizationSkeleton";
import ScalarSkeleton from "metabase/visualizations/components/skeletons/ScalarSkeleton/ScalarSkeleton";
import { ChartSkeletonDisplayType } from "metabase/visualizations/components/skeletons/util/display-type";

type ChartSkeletonProps = HTMLAttributes<HTMLDivElement> & {
  display?: ChartSkeletonDisplayType;
  name?: string | null;
  description?: string | null;
  actionMenu?: JSX.Element | null;
};

const skeletonComponent: (display: ChartSkeletonDisplayType) => JSX.Element = (
  display: ChartSkeletonDisplayType,
) => {
  if (!display) {
    return <EmptySkeleton />;
  }

  switch (display) {
    case "area":
      return <AreaSkeleton />;
    case "bar":
      return <BarSkeleton />;
    case "funnel":
      return <FunnelSkeleton />;
    case "gauge":
      return <GaugeSkeleton />;
    case "line":
      return <LineSkeleton />;
    case "map":
      return <MapSkeleton />;
    case "object":
    case "pivot":
    case "table":
      return <TableSkeleton />;
    case "pie":
      return <PieSkeleton />;
    case "progress":
      return <ProgressSkeleton />;
    case "row":
      return <RowSkeleton />;
    case "scatter":
      return <ScatterSkeleton />;
    case "waterfall":
      return <WaterfallSkeleton />;
    default:
      return <TableSkeleton />;
  }
};

const ChartSkeleton = ({
  actionMenu,
  description,
  display,
  name,
  className,
}: ChartSkeletonProps) => {
  if (!display) {
    return <EmptySkeleton />;
  }

  if (display === "scalar" || display === "smartscalar") {
    return (
      <ScalarSkeleton
        className={className}
        scalarType={display}
        name={name}
        description={description}
        actionMenu={actionMenu}
      />
    );
  }

  return (
    <VisualizationSkeleton
      className={className}
      name={name}
      description={description}
      actionMenu={actionMenu}
    >
      {skeletonComponent(display)}
    </VisualizationSkeleton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Object.assign(ChartSkeleton, {
  Title: SkeletonCaption.Title,
  Description: SkeletonCaption.Description,
});
