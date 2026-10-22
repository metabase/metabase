import type { JSX } from "react";

import { ChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeletonImage";

const FunnelSkeleton = (): JSX.Element => {
  return (
    <ChartSkeletonImage
      mt="lg"
      viewBox="0 0 370 104"
      preserveAspectRatio="xMidYMid"
    >
      <path
        d="m0 0 123 24v56L0 104V0ZM124 24l122 16v32l-122 8V24ZM247 40l123 8v15l-123 9V40Z"
        fill="currentColor"
      />
    </ChartSkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default FunnelSkeleton;
