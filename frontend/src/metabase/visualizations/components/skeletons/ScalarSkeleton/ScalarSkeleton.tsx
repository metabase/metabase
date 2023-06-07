import styled from "@emotion/styled";
import SkeletonCaption from "metabase/visualizations/components/skeletons/SkeletonCaption/SkeletonCaption";
import { containerStyles, animationStyles } from "../Skeleton";

export const SkeletonRoot = styled.div`
  ${containerStyles};
  justify-content: center;
  align-items: center;
`;

export const SkeletonTopImage = styled.svg`
  ${animationStyles};
  height: 2rem;
  margin-top: 0.625rem;
`;

export const SkeletonBottomImage = styled.svg`
  ${animationStyles};
  height: 0.5rem;
`;

export const SkeletonCenterCaption = styled(SkeletonCaption)`
  margin-top: 0.25rem;
  margin-bottom: 2.25rem;
`;

const ScalarSkeleton = ({
  scalarType = "scalar",
  name,
  description,
  actionMenu,
  className,
}: {
  scalarType?: "scalar" | "smartscalar";
  name?: string | null;
  description?: string | null;
  actionMenu?: JSX.Element | null;
  className?: string;
}): JSX.Element => {
  return (
    <SkeletonRoot className={className}>
      <SkeletonTopImage xmlns="http://www.w3.org/2000/svg" viewBox="0 0 103 32">
        <rect width="103" height="32" rx="16" fill="currentColor" />
      </SkeletonTopImage>
      <SkeletonCenterCaption
        name={name}
        description={description}
        size="large"
      />
      {scalarType === "smartscalar" && (
        <SkeletonBottomImage
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 182 8"
        >
          <circle cx="47.121" cy="4.5" r="2" fill="currentColor" />
          <rect x="56" width="126" height="8" rx="4" fill="currentColor" />
          <rect width="38" height="8" rx="4" fill="currentColor" />
        </SkeletonBottomImage>
      )}
    </SkeletonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ScalarSkeleton;
