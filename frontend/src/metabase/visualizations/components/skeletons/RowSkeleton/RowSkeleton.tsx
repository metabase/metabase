import type { JSX } from "react";

import { ChartSkeletonImage } from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeletonImage";

const RowSkeleton = (): JSX.Element => {
  return (
    <ChartSkeletonImage
      mt="lg"
      viewBox="0 0 346 130"
      preserveAspectRatio="none"
    >
      <path
        fill="currentColor"
        d="M293 27v22H0V27zM224 54v22H0V54zM346 81v22H0V81zM73 108v22H0v-22zM129 0v22H0V0z"
      />
    </ChartSkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RowSkeleton;
