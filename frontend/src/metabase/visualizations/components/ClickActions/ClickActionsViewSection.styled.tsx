import { css } from "@emotion/react";
import styled from "@emotion/styled";

import type { ContentDirectionType } from "./utils";

export const Section = styled.div<{
  type: string;
  direction?: ContentDirectionType;
}>`
  display: flex;
  ${({ type, direction }) =>
    type === "sort" &&
    direction === "row" &&
    css`
      margin: 0 0 0.5rem -0.5rem;
    `}
  ${({ direction }) =>
    direction === "row"
      ? css`
          flex-direction: row;
        `
      : css`
          flex-direction: column;
          align-items: stretch;
        `}
  gap: 0.5rem;
`;

export const SectionWithTitle = styled.div<{
  childrenDirection?: ContentDirectionType;
}>`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: ${({ childrenDirection }) =>
    childrenDirection === "row" ? `0.75rem` : `1rem`};
  margin: ${({ childrenDirection }) =>
    childrenDirection === "row" ? `0.5rem 0` : `0.5rem 0 0`};
`;

export const SectionTitle = styled.p`
  margin: 0;
  font-size: 0.875em;
  color: ${({ theme }) => theme.fn.themeColor("text-medium")};
`;
