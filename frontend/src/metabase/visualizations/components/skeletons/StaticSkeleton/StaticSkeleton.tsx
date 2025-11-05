import type { HTMLAttributes, ReactNode } from "react";

import type { IconName } from "metabase/ui";
import { Group, Tooltip } from "metabase/ui";

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
  nameRightSection?: ReactNode;
  description?: string | null;
  icon?: StaticSkeletonIconProps;
  tooltip?: string;
}

export interface StaticSkeletonIconProps {
  name: IconName;
}

const StaticSkeleton = ({
  name,
  nameRightSection,
  description,
  icon,
  tooltip,
  ...props
}: StaticSkeletonProps): JSX.Element => {
  const defaultedDescription = description || "";

  return (
    <SkeletonRoot {...props}>
      {icon && (
        <Tooltip label={tooltip} disabled={!tooltip}>
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
      <Group gap="0.5rem">
        <SkeletonTitle>{name}</SkeletonTitle>
        {nameRightSection}
      </Group>

      <SkeletonDescription>{defaultedDescription}</SkeletonDescription>
    </SkeletonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticSkeleton;
