import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import type { ButtonProps } from "metabase/ui";
import { Button } from "metabase/ui";

export const UserElement = styled(Button)<
  HTMLAttributes<HTMLButtonElement> & ButtonProps
>`
  &:hover,
  &:focus {
    background-color: ${({ theme }) => theme.colors.brand[0]};
  }

  & > div {
    display: flex;
    justify-content: flex-start;
  }
`;
