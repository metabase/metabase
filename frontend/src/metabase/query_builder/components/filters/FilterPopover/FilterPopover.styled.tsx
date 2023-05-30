import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";

import { BaseButton } from "metabase/core/components/Button";

type Props = {
  primaryColor?: string;
};

export const Button = styled(BaseButton)<Props>`
  color: white;
  border-color: ${({ primaryColor = color("brand") }) => primaryColor};
  background-color: ${({ primaryColor = color("brand") }) => primaryColor};

  &:hover,
  &:focus {
    color: white;
    border-color: ${({ primaryColor = color("brand") }) => primaryColor};
    background-color: ${({ primaryColor = color("brand") }) =>
      alpha(primaryColor, 0.8)};
  }
`;
