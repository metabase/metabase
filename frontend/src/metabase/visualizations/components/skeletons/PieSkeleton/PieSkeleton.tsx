import { SkeletonImage } from "./PieSkeleton.styled";

const PieSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 306 138"
      fill="none"
      preserveAspectRatio="xMidYMid"
    >
      <rect y="24" width="80" height="11" rx="5.5" fill="currentColor" />
      <rect y="50" width="80" height="11" rx="5.5" fill="currentColor" />
      <rect y="76" width="80" height="11" rx="5.5" fill="currentColor" />
      <rect y="102" width="80" height="11" rx="5.5" fill="currentColor" />
      <path
        d="M237 12a56.998 56.998 0 0 1 56.961 54.888M294 69a56.992 56.992 0 0 1-16.695 40.305A56.986 56.986 0 0 1 237 126M235.011 125.965A56.999 56.999 0 0 1 180 69.123M180.035 67.01a57 57 0 0 1 55.373-54.988"
        stroke="currentColor"
        strokeWidth="24"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default PieSkeleton;
