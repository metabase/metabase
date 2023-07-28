import { SkeletonImage } from "./BarSkeleton.styled";

const BarSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 372 117"
      preserveAspectRatio="none"
    >
      <path
        fill="currentColor"
        d="M0 38.71h23.878V117H0zM28.906 20.503h23.878V117H28.906zM57.81 38.71h23.878V117H57.81zM86.715 0h23.878v117H86.715zM115.62 20.503h23.878V117H115.62zM144.527 25.965h23.878v91.034h-23.878zM173.431 9.579h25.135V117h-25.135zM202.337 20.503h25.135V117h-25.135zM231.244 20.503h25.135V117h-25.135zM261.406 9.579h23.878V117h-23.878zM290.311 20.503h23.878V117h-23.878zM319.216 20.503h23.878V117h-23.878zM348.121 9.579h23.878V117h-23.878z"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BarSkeleton;
