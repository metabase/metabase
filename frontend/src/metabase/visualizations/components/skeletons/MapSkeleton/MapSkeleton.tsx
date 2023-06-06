import {
  SkeletonRootProps,
  Skeleton,
} from "metabase/visualizations/components/skeletons/Skeleton";
import { SkeletonImage } from "./MapSkeleton.styled";

const MapSkeleton = (props: SkeletonRootProps): JSX.Element => {
  return (
    <Skeleton {...props}>
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 242 157"
        preserveAspectRatio="xMidYMid"
      >
        <image href="/app/assets/img/map.svg" />
      </SkeletonImage>
    </Skeleton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
