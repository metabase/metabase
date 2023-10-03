import type { ButtonHTMLAttributes } from "react";
import { css } from "@emotion/react";
import styled from "@emotion/styled";
import { UnstyledButton } from "metabase/ui";

type OptionButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

export const OptionButton = styled(UnstyledButton)<OptionButtonProps>(
  ({ theme }) => css`
    color: ${theme.colors.text[2]};
    font-weight: bold;
    line-height: 1.5rem;
    width: 100%;
    padding: ${theme.spacing.sm};

    &:hover {
      color: ${theme.colors.brand[1]};
    }
  `,
);
