import { color, alpha } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";
import BaseDateUnitSelector from "./DateUnitSelector";
import BaseNumericInput from "metabase/components/NumericInput";

type BaseProps = {
  primaryColor?: string;
};

export const DateUnitSelector = styled(BaseDateUnitSelector)<BaseProps>`
  button:focus {
    border-color: ${({ primaryColor = defaultColor }) => primaryColor};
  }
`;

export const NumericInput = styled(BaseNumericInput)<BaseProps>`
  &:focus {
    border-color: ${({ primaryColor = defaultColor }) => primaryColor};
  }
`;

type ButtonProps = {
  primaryColor?: string;
  selected?: boolean;
};

const defaultColor = color("brand");

export const CurrentButton = styled(Button)<ButtonProps>`
  border: none;
  border-radius: 99px;

  background-color: ${({ selected, primaryColor = defaultColor }) =>
    selected ? primaryColor : alpha(primaryColor, 0.1)};
  color: ${({ selected, primaryColor = defaultColor }) =>
    selected ? "white" : primaryColor};

  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  &:hover {
    color: white;
    background-color: ${props => props.primaryColor || color("brand")};
  }
`;

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

export const OptionsContainer = styled.div`
  background-color: ${color("white")};
  padding: ${space(2)} ${space(1)};
`;

type OptionButtonProps = ButtonProps & {
  reverseIconDirection?: boolean;
};

export const OptionButton = styled(Button)<OptionButtonProps>`
  display: block;
  border: none;

  .Icon {
    transform: ${({ reverseIconDirection }) =>
      reverseIconDirection ? "rotate(180deg)" : ""};
  }

  color: ${({ selected, primaryColor = defaultColor }) =>
    selected ? primaryColor : color("text-dark")};

  &:hover {
    color: ${({ primaryColor = defaultColor }) => primaryColor};
    background: none;
  }
`;

export const MoreButton = styled(Button)<ButtonProps>`
  border: none;
  color: ${color("text-medium")};

  &:hover {
    color: ${({ primaryColor = defaultColor }) => primaryColor};
  }
`;

type GridProps = {
  numColumns?: number;
};

export const GridContainer = styled.div<GridProps>`
  display: grid;
  grid-template-columns: repeat(${({ numColumns = 3 }) => numColumns}, auto);
  justify-content: start;
  align-items: center;
  grid-gap: ${space(1)};
`;

export const GridText = styled.div`
  font-size: 1em;
  color: ${color("text-medium")};
`;
