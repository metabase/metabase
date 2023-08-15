import { HTMLAttributes } from "react";

import { IconName } from "metabase/core/components/Icon";
import Tooltip from "metabase/core/components/Tooltip";

import {
  SkeletonDescription,
  SkeletonIcon,
  SkeletonIconContainer,
  SkeletonRoot,
  SkeletonTitle,
  SkeletonTooltipIcon,
  SkeletonTooltipIconContainer,
} from "./StaticSkeleton.styled";

export interface StaticSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
  icon?: StaticSkeletonIconProps;
  tooltip?: string;
}

export interface StaticSkeletonIconProps {
  name: IconName;
}

const StaticSkeleton = ({
  name,
  description,
  icon,
  tooltip,
  ...props
}: StaticSkeletonProps): JSX.Element => {
  const defaultedDescription = description || "";

  return (
    <SkeletonRoot {...props}>
      {icon && (
        <Tooltip tooltip={tooltip}>
          <SkeletonIconContainer>
            <SkeletonIcon {...icon} />
            {tooltip && (
              <SkeletonTooltipIconContainer>
                <SkeletonTooltipIcon name="eye_crossed_out" />
              </SkeletonTooltipIconContainer>
            )}
          </SkeletonIconContainer>
        </Tooltip>
      )}
      <SkeletonTitle>{name}</SkeletonTitle>

      <SkeletonDescription>{defaultedDescription}</SkeletonDescription>
    </SkeletonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticSkeleton;
