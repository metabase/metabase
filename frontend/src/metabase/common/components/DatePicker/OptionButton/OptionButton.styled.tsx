import type { ButtonHTMLAttributes } from "react";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { UnstyledButton } from "metabase/ui";

interface OptionButtonRootProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  isSelected?: boolean;
}

export const OptionButtonRoot = styled(UnstyledButton)<OptionButtonRootProps>(
  ({ theme, isSelected }) => css`
    color: ${isSelected ? theme.colors.brand[1] : theme.colors.text[2]};
    font-weight: bold;
    line-height: 1.5rem;
    width: 100%;
    padding: ${theme.spacing.sm};

    &:hover {
      color: ${theme.colors.brand[1]};
    }
  `,
);
