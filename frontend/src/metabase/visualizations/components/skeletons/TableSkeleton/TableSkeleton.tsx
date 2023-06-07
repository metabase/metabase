import { SkeletonImage } from "./TableSkeleton.styled";

const TableSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 369 144"
      preserveAspectRatio="none"
    >
      <path fill="currentColor" d="M0 27h94v10H0z" />
      <rect width="58" height="11" rx="5.5" fill="currentColor" />
      <rect x="138" width="58" height="11" rx="5.5" fill="currentColor" />
      <rect x="275" width="58" height="11" rx="5.5" fill="currentColor" />
      <path
        fill="currentColor"
        d="M0 53h94v10H0zM0 80h94v10H0zM0 107h94v10H0zM0 134h94v10H0zM138 27h93v10h-93zM138 53h93v10h-93zM138 80h93v10h-93zM138 107h93v10h-93zM138 134h93v10h-93zM275 27h94v10h-94zM275 53h94v10h-94zM275 80h94v10h-94zM275 107h94v10h-94zM275 134h94v10h-94z"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default TableSkeleton;
