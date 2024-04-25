import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

interface ButtonRootProps {
  isSelected?: boolean;
}

export const ButtonRoot = styled(Button)<ButtonRootProps>`
  color: ${props => !props.isSelected && color("text-dark")};

  &:hover {
    color: ${props => !props.isSelected && color("brand")};
  }
`;
