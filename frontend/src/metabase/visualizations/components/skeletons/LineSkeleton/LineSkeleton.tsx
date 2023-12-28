import { SkeletonImage } from "./LineSkeleton.styled";

const LineSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 371 113"
      fill="none"
      preserveAspectRatio="none"
    >
      <path
        d="m1 111 15.336-10 18.043 10 22.553-16.5 15.336 9.5 46.91-47 30.331 16 31.013-16 20.299 16 43.752-41 24.358 31 15.273-15.5L299.603 63l48.714-60L374 63"
        stroke="currentColor"
        strokeWidth="2"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LineSkeleton;
