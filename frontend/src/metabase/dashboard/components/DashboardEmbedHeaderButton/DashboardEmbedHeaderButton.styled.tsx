import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

export const DashboardButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  &:hover {
    background-color: ${({ theme }) => theme.colors.brand[1]};
  }
`;
