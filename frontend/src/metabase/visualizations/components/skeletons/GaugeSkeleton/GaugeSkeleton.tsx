import { SkeletonImage } from "./GaugeSkeleton.styled";

const GaugeSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 169 143"
      preserveAspectRatio="xMidYMid"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M32.355 51.786c24.355-39.382 78.268-39.256 103.369.126 9.597 15.06 11.924 28.144 10.204 39.932-1.764 12.098-7.969 24.037-17.566 36.209l17.276 13.621c10.903-13.828 19.532-29.321 22.06-46.655 2.573-17.643-1.35-35.99-13.422-54.931-33.535-52.618-107.472-53.492-140.632.126-27.127 43.866-6.504 83.779 9.63 101.952l16.451-14.605c-12.866-14.493-27.242-43.64-7.37-75.775Zm38.916 25.991a5.994 5.994 0 0 0 0 11.988H97.87a5.994 5.994 0 0 0 0-11.988h-26.6Z"
        fill="currentColor"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default GaugeSkeleton;
