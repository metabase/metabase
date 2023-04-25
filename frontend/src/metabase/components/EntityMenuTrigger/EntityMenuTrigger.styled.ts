import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

export interface EntityMenuIconButtonProps {
  className?: string;
  color?: string;
  hover?: {
    color: string;
    backgroundColor: string;
  };
  "data-testid"?: string;
}

export const EntityMenuIconButton = styled(Button)<EntityMenuIconButtonProps>`
  width: 32px;
  height: 32px;

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
