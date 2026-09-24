import mapImage from "assets/img/map.svg?url";

import { SkeletonImage } from "./MapSkeleton.styled";

const MapSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 242 157"
      preserveAspectRatio="xMidYMid"
    >
      <use xlinkHref={mapImage} />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MapSkeleton;
