import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const ErrorPageRoot = styled.div<{ bordered?: boolean }>`
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${({ bordered, theme }) =>
    bordered &&
    css`
      border: 1px solid ${theme.fn.themeColor("border")};
    `}
  border-radius: 0.5rem;
  overflow: hidden;
`;

export const ResponsiveSpan = styled.span`
  overflow: hidden;
`;
