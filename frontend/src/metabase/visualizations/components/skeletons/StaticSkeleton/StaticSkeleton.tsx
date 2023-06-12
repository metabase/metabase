import { HTMLAttributes } from "react";

import { IconName } from "metabase/core/components/Icon";
import Markdown from "metabase/core/components/Markdown";
import Tooltip from "metabase/core/components/Tooltip";
import { getLeadingText, parseMarkdown } from "metabase/lib/markdown";

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
  const descriptionMarkdownRoot = parseMarkdown(defaultedDescription);
  const hasMoreDescriptionToShow = descriptionMarkdownRoot.children.length > 1;

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
      {description && (
        <SkeletonDescription
          alwaysShowTooltip={hasMoreDescriptionToShow}
          placement="bottom"
          tooltip={
            <Markdown disallowHeading unstyleLinks>
              {description}
            </Markdown>
          }
        >
          {getLeadingText(descriptionMarkdownRoot)}
        </SkeletonDescription>
      )}
    </SkeletonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticSkeleton;
