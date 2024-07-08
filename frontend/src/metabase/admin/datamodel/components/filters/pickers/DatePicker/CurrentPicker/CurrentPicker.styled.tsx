import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { alpha, color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const CurrentContainer = styled.div<{ first?: boolean }>`
  display: flex;
  flex-wrap: no-wrap;
  grid-gap: ${space(2)};
  margin-bottom: ${({ first }) => (first ? space(2) : "")};
`;

export const CurrentPopover = styled.div`
  color: ${color("white")};
  background-color: ${color("black")};
  padding: ${space(1)} ${space(2)};
`;

type ButtonProps = {
  primaryColor?: string;
  selected?: boolean;
};

export const CurrentButton = styled(Button)<ButtonProps>`
  border: none;
  border-radius: 99px;
  background-color: ${({ selected, primaryColor = color("brand") }) =>
    selected ? primaryColor : alpha(primaryColor, 0.1)};
  color: ${({ selected, primaryColor = color("brand") }) =>
    selected ? "white" : primaryColor};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  &:hover {
    color: white;
    background-color: ${props => props.primaryColor || color("brand")};
  }
`;
