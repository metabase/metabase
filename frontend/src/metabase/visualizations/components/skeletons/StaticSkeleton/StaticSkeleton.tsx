import type { HTMLAttributes, ReactNode } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { IconName } from "metabase/ui";
import { Group, Tooltip } from "metabase/ui";

import {
  SkeletonDescription,
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
  iconUrl?: string;
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
            <EntityIcon
              {...icon}
              size="1.5rem"
              // Use the raw CSS var rather than the `text-secondary` ColorName
              // so Loki visual snapshots resolve it via stylesheets instead of
              // inlining a theme value that differs between runs.
              color="var(--mb-color-text-secondary)"
              style={{ display: "block" }}
            />
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
