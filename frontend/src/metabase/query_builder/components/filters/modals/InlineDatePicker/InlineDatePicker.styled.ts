import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";
import { color, alpha } from "metabase/lib/colors";

import Button from "metabase/core/components/Button";

export const OptionContainer = styled.div`
  grid-column: span 2 / span 2;
  margin: ${space(2)} 0;
  padding-bottom: ${space(2)};
  font-weight: bold;
  border-bottom: 1px solid ${color("border")};
`;

type OptionButtonProps = {
  primaryColor?: string;
  selected?: boolean;
};

export const OptionButton = styled(Button)<OptionButtonProps>`
  border-color: ${({ selected }) =>
    selected ? color("brand") : color("border")}
  border-radius: ${space(1)};
  margin-right: ${space(1)};
  margin-bottom: ${space(1)};

  background-color: ${({ selected, primaryColor = color("brand") }) =>
    selected ? alpha(primaryColor, 0.3) : color("white")};
  color: ${({ selected, primaryColor = color("brand") }) =>
    selected ? primaryColor : color("text-dark")};

  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  &:hover {
    background-color: ${({ selected, primaryColor = color("brand") }) =>
      selected ? alpha(primaryColor, 0.3) : color("white")};
    border-color: ${color("brand")};
  }
`;

export const ClearButton = styled.span`
  color: ${alpha("brand", 0.5)};
  margin-left: ${space(1)};
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
