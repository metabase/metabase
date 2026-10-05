import { ChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeletonImage";

const MapSkeleton = (): JSX.Element => {
  return (
    <ChartSkeletonImage viewBox="0 0 242 157" preserveAspectRatio="xMidYMid">
      <use xlinkHref="/app/assets/img/map.svg" />
    </ChartSkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
