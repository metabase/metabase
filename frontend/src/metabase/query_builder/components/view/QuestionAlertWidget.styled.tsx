import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

interface AlertIconProps {
  isActive?: boolean;
}

export const AlertIcon = styled(Icon)<AlertIconProps>`
  cursor: pointer;
  color: ${props => props.isActive && color("brand")};

  &:hover {
    color: ${color("brand")};
  }
`;
