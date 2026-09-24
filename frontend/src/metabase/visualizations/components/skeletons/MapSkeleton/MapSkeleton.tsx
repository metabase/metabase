import { Box } from "metabase/ui";
import ChartSkeletonS from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.module.css";

const MapSkeleton = (): JSX.Element => {
  return (
    <Box
      component="svg"
      className={ChartSkeletonS.animated}
      flex="1 1 0"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 242 157"
      preserveAspectRatio="xMidYMid"
    >
      <use xlinkHref="/app/assets/img/map.svg" />
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
