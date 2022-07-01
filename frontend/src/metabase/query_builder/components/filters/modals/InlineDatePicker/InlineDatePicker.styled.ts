import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color, alpha, darken, lighten } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";

export const OptionContainer = styled.div`
  font-weight: bold;
`;

type OptionButtonProps = {
  primaryColor?: string;
  active?: boolean;
};

export const OptionButton = styled(Button)<OptionButtonProps>`
  border-radius: ${space(1)};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};
  margin-right: ${space(1)};
  margin-bottom: ${space(1)};

  background-color: ${({ active }) =>
    active ? color("brand") : color("white")};
  color: ${({ active }) => (active ? color("white") : color("text-dark"))};
  border-color: ${({ active }) => (active ? "transparent" : color("border"))};

  &:hover {
    background-color: ${({ active }) =>
      active ? alpha("brand", 0.8) : alpha("brand", 0.2)};
    color: ${({ active }) => (active ? color("white") : color("text-dark"))};
    border-color: ${({ active }) =>
      active ? alpha("brand", 0.8) : color("transparent")};
  }
`;

export const ClearButton = styled.span`
  color: ${lighten("brand", 0.5)};
  margin-left: ${space(1)};
  cursor: pointer;

  &:hover {
    color: ${color("white")};
  }
`;
