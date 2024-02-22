import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { MarkdownPreview } from "metabase/core/components/MarkdownPreview";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const SkeletonRoot = styled.div`
  position: relative;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const SkeletonDescription = styled(MarkdownPreview)`
  color: ${color("text-medium")};
  line-height: 1.5rem;
`;

export const SkeletonIcon = styled(Icon)`
  display: block;
  color: ${color("text-medium")};
  width: 1.5rem;
  height: 1.5rem;
`;

export const SkeletonTooltipIcon = styled(Icon)`
  display: block;
  color: ${color("text-light")};
  width: 0.75rem;
  height: 0.75rem;
`;

export const SkeletonIconContainer = styled.div`
  position: relative;
  width: 1.5rem;
  margin-top: 0.5rem;
  margin-bottom: 1rem;

  &:hover {
    ${SkeletonTooltipIcon} {
      color: ${color("text-medium")};
    }
  }
`;

export const SkeletonTooltipIconContainer = styled.div`
  position: absolute;
  right: -0.5rem;
  bottom: -0.5rem;
  padding: 0.125rem;
  border-radius: 0.5rem;
  background-color: ${color("white")};
`;
