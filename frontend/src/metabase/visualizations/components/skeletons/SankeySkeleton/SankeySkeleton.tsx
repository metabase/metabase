import { SkeletonImage } from "./SankeySkeleton.styled";

const SankeySkeleton = (): JSX.Element => {
  return (
    <SkeletonImage
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 200"
      preserveAspectRatio="none"
    >
      <path
        fill="currentColor"
        d="M158 160v40H83v-44l75 4ZM160 86c10.542 0 21.687 3.951 29.89 10.861l.508.437c.036.03.071.062.107.094l-.021-.018c2.489 2.179 4.69 4.637 6.496 7.347l1.93 2.894A45.778 45.778 0 0 0 237 128v72a45.778 45.778 0 0 1-38.09-20.385l-1.93-2.894C189.183 165.025 174.057 158 160 158V86ZM320 158h-81V40h81v118Z"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M158 136.5h-7.949a47.418 47.418 0 0 0-28.021 9.166l-1.56 1.168A47.417 47.417 0 0 1 92.45 156H83v-44h7.291a43.365 43.365 0 0 0 30.186-12.231l1.546-1.538A43.365 43.365 0 0 1 152.209 86H158v50.5Zm-38.313-35.983c-.168.154-.34.304-.509.456.178-.159.357-.318.533-.48l-.024.024Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        d="M101.8 0a99.102 99.102 0 0 1 58.891 19.395l1.618 1.21A99.102 99.102 0 0 0 221.2 40H237v86a43.78 43.78 0 0 1-36.426-19.495l-1.929-2.894C190.423 91.28 174.624 84 160 84h-7.791a45.363 45.363 0 0 0-32.387 13.6A41.363 41.363 0 0 1 90.291 110H83V0h18.8ZM81 24c-11.522 0-23.931 6.88-28.448 17.48l-22.8 53.5C25.356 105.302 11.22 112 0 112V88c11.219 0 25.355-6.698 29.753-17.02l22.799-53.5C57.069 6.88 69.478 0 81 0v24Z"
      />
      <path
        fill="currentColor"
        d="m199.856 108.978-.133-.184-.057-.081.19.265Z"
      />
    </SkeletonImage>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SankeySkeleton;
