import { SkeletonImage } from "./WaterfallSkeleton.styled";

const WaterfallSkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 372 107"
      preserveAspectRatio="none"
    >
      <path
        fill="currentColor"
        d="M0 28.71h23.878V107H0zM29 11h24v45H29zM58 22h24v17H58zM87 39h24v68H87zM115.62 10.503h23.878V107H115.62zM145 0h23v45h-23zM173 39h26v68h-26zM202 80h25v27h-25zM231 11h25v39h-25zM261 0h24v29h-24zM290 11h24v69h-24zM319 11h24v96h-24zM348 0h24v56h-24z"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default WaterfallSkeleton;
