// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { MarkdownPreview } from "metabase/common/components/MarkdownPreview";
import { Icon } from "metabase/ui";

export const SkeletonRoot = styled.div`
  position: relative;
`;

export const SkeletonTitle = styled(Ellipsified)`
  color: var(--mb-color-text-primary);
  font-size: 1rem;
  line-height: 1.5rem;
  font-weight: bold;
`;

export const SkeletonDescription = styled(MarkdownPreview)`
  color: var(--mb-color-text-secondary);
  line-height: 1.5rem;
`;

export const SkeletonIcon = styled(Icon)`
  display: block;
  color: var(--mb-color-text-secondary);
  width: 1.5rem;
  height: 1.5rem;
`;

export const SkeletonTooltipIcon = styled(Icon)`
  display: block;
  color: var(--mb-color-text-tertiary);
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
      color: var(--mb-color-text-secondary);
    }
  }
`;

export const SkeletonTooltipIconContainer = styled.div`
  position: absolute;
  right: -0.5rem;
  bottom: -0.5rem;
  padding: 0.125rem;
  border-radius: 0.5rem;
  background-color: var(--mb-color-background-primary);
`;
