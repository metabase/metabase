import { css } from "@emotion/react";
import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";

export const StyledButton = styled(Button)<{
  isFullHeight?: boolean;
  focus?: boolean;
}>`
  padding: 0;
  height: ${({ isFullHeight }) => (isFullHeight ? "100%" : "auto")};

  ${({ focus, theme }) =>
    focus
      ? css`
          border: 2px solid ${theme.fn.themeColor("focus")};
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

StyledButton.defaultProps = {
  isFullHeight: true,
};
