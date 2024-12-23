import { css } from "@emotion/react";
import styled from "@emotion/styled";

export const ErrorPageRoot = styled.div<{ bordered?: boolean }>`
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  ${({ bordered }) =>
    bordered &&
    css`
      border: 1px solid var(--mb-color-border);
    `}
  border-radius: 0.5rem;
  overflow: hidden;
`;
