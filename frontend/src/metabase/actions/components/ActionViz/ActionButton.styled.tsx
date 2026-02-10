// eslint-disable-next-line no-restricted-imports
import { css } from "@emotion/react";
// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { Button, type ButtonProps } from "metabase/common/components/Button";

interface StyledButtonProps extends ButtonProps {
  isFullHeight?: boolean;
  focus?: boolean;
}

export const StyledButton = styled(Button)<StyledButtonProps>`
  padding: 0;
  height: ${({ isFullHeight = true }) => (isFullHeight ? "100%" : "auto")};

  ${({ focus }) =>
    focus
      ? css`
          border: 2px solid var(--mb-color-focus);
        `
      : ""}
`;

export const FullContainer = styled.div`
  width: 100%;
  height: 100%;
`;

export const StyledButtonContent = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
`;
