import { color, alpha } from "metabase/lib/colors";
import styled from "@emotion/styled";

import BaseButton from "metabase/core/components/Button";

type Props = {
  primaryColor?: string;
};

export const Button = styled(BaseButton)<Props>`
  color: white;
  border-color: ${({ primaryColor = defaultColor }) => primaryColor};
  background-color: ${({ primaryColor = defaultColor }) => primaryColor};

  &:hover,
  &:focus {
    color: white;
    border-color: ${({ primaryColor = defaultColor }) => primaryColor};
    background-color: ${({ primaryColor = defaultColor }) =>
      alpha(primaryColor, 0.8)};
  }
`;

const defaultColor = color("brand");
