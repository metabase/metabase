import cx from "classnames";

import { Box } from "metabase/ui";
import ChartSkeletonS from "metabase/visualizations/components/skeletons/ChartSkeleton/ChartSkeleton.module.css";

import S from "./ScatterSkeleton.module.css";

const ScatterSkeleton = (): JSX.Element => {
  return (
    <Box
      component="svg"
      className={cx(ChartSkeletonS.animated, S.root)}
      flex="1 1 0"
      mt="lg"
      pl="sm"
      pb="sm"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 340 119"
      preserveAspectRatio="xMidYMid"
    >
      <circle cx="11" cy="58" r="11" fill="currentColor" />
      <circle cx="88" cy="58" r="26" fill="currentColor" />
      <circle cx="208" cy="29" r="21" fill="currentColor" />
      <circle cx="301.5" cy="80.5" r="38.5" fill="currentColor" />
      <circle cx="11" cy="20" r="6" fill="currentColor" />
      <circle cx="82" cy="4" r="4" fill="currentColor" />
      <circle cx="298" cy="4" r="4" fill="currentColor" />
      <circle cx="141" cy="15" r="11" fill="currentColor" />
      <circle cx="141" cy="87" r="16" fill="currentColor" />
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScatterSkeleton;
