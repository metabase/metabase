import { ChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeletonImage";

const ProgressSkeleton = (): JSX.Element => {
  return (
    <ChartSkeletonImage
      mt="lg"
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
    </ChartSkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ProgressSkeleton;
