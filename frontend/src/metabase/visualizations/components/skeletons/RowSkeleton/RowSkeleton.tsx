import { SkeletonImage } from "./RowSkeleton.styled";

const RowSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 346 130"
      preserveAspectRatio="none"
    >
      <path
        fill="currentColor"
        d="M293 27v22H0V27zM224 54v22H0V54zM346 81v22H0V81zM73 108v22H0v-22zM129 0v22H0V0z"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default RowSkeleton;
