import { SkeletonImage } from "./AreaSkeleton.styled";

const AreaSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 371 113"
      preserveAspectRatio="none"
    >
      <path
        d="M15.254 97.568 0 107.524V113h371V59.736L345.455 0l-48.453 59.736-15.317-15.432-15.191 15.432-24.227-30.864-43.517 40.82-20.19-15.93-30.847 15.93-30.169-15.93-46.658 46.793-15.254-9.458L33.2 107.524l-17.946-9.956Z"
        fill="currentColor"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AreaSkeleton;
