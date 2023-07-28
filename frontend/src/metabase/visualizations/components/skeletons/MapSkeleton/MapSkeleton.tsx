import { SkeletonImage } from "./MapSkeleton.styled";

const MapSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 242 157"
      preserveAspectRatio="xMidYMid"
    >
      <image href="/app/assets/img/map.svg" />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
