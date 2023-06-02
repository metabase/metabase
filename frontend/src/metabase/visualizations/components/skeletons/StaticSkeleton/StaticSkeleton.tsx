import { HTMLAttributes } from "react";
import Markdown from "metabase/core/components/Markdown";
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
import { renderMarkdown, getLeadingText } from "./utils";

export interface StaticSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  name?: string | null;
  description?: string | null;
  icon?: StaticSkeletonIconProps;
  tooltip?: string;
}

export interface StaticSkeletonIconProps {
  name: string;
}

const StaticSkeleton = ({
  name,
  description,
  icon,
  tooltip,
  ...props
}: StaticSkeletonProps): JSX.Element => {
  const descriptionElements = renderMarkdown(description || "");
  const hasMoreElementsToShow = descriptionElements.length > 1;

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
          alwaysShowTooltip={hasMoreElementsToShow}
          tooltip={<Markdown>{description}</Markdown>}
        >
          {getLeadingText(descriptionElements)}
        </SkeletonDescription>
      )}
    </SkeletonRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default StaticSkeleton;
