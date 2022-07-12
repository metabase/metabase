import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import Button from "metabase/core/components/Button";

interface EntityMenuIconButtonProps {
  isInvertedColor?: boolean;
}

export const EntityMenuIconButton = styled(Button)<EntityMenuIconButtonProps>`
  width: 40px;
  height: 40px;

  &:hover {
    background-color: ${color("bg-medium")};
  }

  ${({ isInvertedColor }) => {
    return (
      isInvertedColor &&
      `color: ${color("text-light")};

      &:hover {
        color: ${color("text-white")};
        background-color: ${color("brand")};
      }`
    );
  }}
`;

EntityMenuIconButton.defaultProps = {
  iconSize: 18,
  onlyIcon: true,
};
