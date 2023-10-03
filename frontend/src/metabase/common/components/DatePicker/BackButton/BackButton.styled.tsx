import type { ButtonHTMLAttributes } from "react";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { UnstyledButton } from "metabase/ui";

type BackButtonRootProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const BackButtonRoot = styled(UnstyledButton)<BackButtonRootProps>(
  ({ theme }) => css`
    color: ${theme.colors.text[1]};
    font-weight: bold;
    padding: ${theme.spacing.sm} 0;

    &:hover {
      color: ${theme.colors.brand[1]};
    }
  `,
);
