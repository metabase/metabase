// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Icon } from "metabase/ui";

import type { SkeletonCaptionSize } from "./types";

export const SkeletonCaptionRoot = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
`;

interface SkeletonTitleProps {
  size: SkeletonCaptionSize;
}

export const SkeletonCaptionTitle = styled(Ellipsified)<SkeletonTitleProps>`
  color: var(--mb-color-text-primary);
  font-size: ${(props) => (props.size === "large" ? "1rem" : "")};
  line-height: ${(props) => (props.size === "large" ? "1.375rem" : "")};
  font-weight: bold;
  overflow: hidden;
`;

export const SkeletonCaptionDescription = styled(Icon)`
  color: var(--mb-color-text-secondary);
  margin-left: 0.5rem;
  visibility: hidden;
`;
