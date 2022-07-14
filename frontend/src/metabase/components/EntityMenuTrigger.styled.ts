import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

interface EntityMenuIconButtonProps {
  color?: string;
  hover?: {
    color: string;
    backgroundColor: string;
  };
}

export const EntityMenuIconButton = styled(Button)<EntityMenuIconButtonProps>`
  width: 40px;
  height: 40px;

  ${({ color }) => (color ? `color: ${color}` : null)};

  &:hover {
    ${({ hover }) => (hover?.color ? `color: ${hover.color}` : null)};
    background-color: ${({ hover }) =>
      hover?.backgroundColor ? hover.backgroundColor : color("bg-medium")};
  }
`;

EntityMenuIconButton.defaultProps = {
  iconSize: 16,
  onlyIcon: true,
};
