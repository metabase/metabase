import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import Ellipsified from "metabase/core/components/Ellipsified";
import Markdown from "metabase/core/components/Markdown";

export const SkeletonRoot = styled.div`
  position: relative;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: ${color("text-dark")};
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const TruncatedMarkdown = styled(Markdown)`
  color: ${color("text-medium")};
  line-height: 1.5rem;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: break-word;
  white-space: pre-line;
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
