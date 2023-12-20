import styled from "@emotion/styled";
import { Button } from "metabase/ui";
import type { ButtonProps } from "metabase/ui";

export const ButtonStyled = styled(Button)<ButtonProps>`
  span {
    width: 100%;
    height: 100%;
  }
`;
