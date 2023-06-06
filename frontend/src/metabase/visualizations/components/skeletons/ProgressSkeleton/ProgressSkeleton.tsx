import {
  SkeletonRootProps,
  Skeleton,
} from "metabase/visualizations/components/skeletons/Skeleton";
import { SkeletonImage } from "../FunnelSkeleton/FunnelSkeleton.styled";

const ProgressSkeleton = (props: SkeletonRootProps): JSX.Element => {
  return (
    <Skeleton {...props}>
      <SkeletonImage
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 404 57"
        preserveAspectRatio="xMidYMid"
      >
        <rect
          opacity=".32"
          y="12"
          width="404"
          height="35"
          rx="4"
          fill="currentColor"
        />
        <path
          d="M0 16a4 4 0 0 1 4-4h298v35H4a4 4 0 0 1-4-4V16ZM302 .485h8.485L302 8.971 293.515.485H302Z"
          fill="currentColor"
        />
      </SkeletonImage>
    </Skeleton>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ProgressSkeleton;
