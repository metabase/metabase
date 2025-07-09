// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { hueRotate } from "metabase/lib/colors";

export const QuestionsPageContainer = styled.div`
  display: flex;
  height: 100%;
  padding: 2rem;
  background-color: var(--mb-color-bg-white);
  gap: 2rem;
  position: relative;
`;

export const QuestionsPageIllustration = styled.div<{
  backgroundImageSrc: string;
  isDefault: boolean;
}>`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  filter: ${({ isDefault }) =>
    isDefault && `hue-rotate(${hueRotate("brand")}deg)`};
  background-image: ${({ backgroundImageSrc }) =>
    `url("${backgroundImageSrc}")`};
  background-size: ${({ isDefault }) =>
    isDefault ? "max(min(1728px, 260vh), 100%) auto" : "100% auto"};
  background-repeat: no-repeat;
  background-position: bottom;
  pointer-events: none;
  z-index: 0;
`;

export const QuestionsPageContent = styled.div`
  max-width: 800px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  z-index: 1;

  h1 {
    font-size: 2rem;
    font-weight: 700;
    color: var(--mb-color-text-dark);
    margin-bottom: 1rem;
  }

  p {
    font-size: 1rem;
    color: var(--mb-color-text-medium);
    margin-bottom: 1rem;
    line-height: 1.5;
  }
`;

export const QuestionsPageSidebar = styled.div`
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid var(--mb-color-border);
  padding-left: 1rem;
  position: relative;
  z-index: 1;
`;
