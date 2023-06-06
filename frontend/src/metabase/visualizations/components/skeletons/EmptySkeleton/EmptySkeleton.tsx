import {
  SkeletonRootProps,
  Skeleton,
} from "metabase/visualizations/components/skeletons/Skeleton";

const EmptySkeleton = (props: SkeletonRootProps): JSX.Element => {
  return <Skeleton {...props} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default EmptySkeleton;
