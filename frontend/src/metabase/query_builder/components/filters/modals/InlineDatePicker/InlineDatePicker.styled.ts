import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color, alpha, darken } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";

export const OptionContainer = styled.div`
  font-weight: bold;
`;

type OptionButtonProps = {
  primaryColor?: string;
  active?: boolean;
};

export const OptionButton = styled(Button)<OptionButtonProps>`
  border: none;

  border-radius: ${space(1)};
  padding: 13px ${space(2)};
  margin-right: ${space(1)};
  margin-bottom: ${space(1)};
  border: 1px solid
    ${({ active }) => (active ? "transparent" : color("border"))};

  background-color: ${({ active }) =>
    active ? alpha("brand", 0.2) : "transparent"};
  color: ${({ active }) => (active ? color("brand") : color("text-dark"))};

  &:hover {
    background-color: ${({ active }) =>
      active ? alpha("brand", 0.35) : "transparent"};
    color: ${color("brand")};
  }
`;

export const ClearButton = styled.span`
  color: ${color("brand")};
  margin-left: ${space(1)};
  cursor: pointer;

  &:hover {
    color: ${darken("brand", 0.2)};
  }
`;
