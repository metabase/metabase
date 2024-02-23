import styled from "@emotion/styled";

import BaseNumericInput from "metabase/components/NumericInput";
import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import BaseDateUnitSelector from "./DateUnitSelector";

type BaseProps = {
  primaryColor?: string;
};

export const DateUnitSelector = styled(BaseDateUnitSelector)<BaseProps>`
  button:focus {
    border-color: ${({ primaryColor = color("brand") }) => primaryColor};
  }
`;

export const NumericInput = styled(BaseNumericInput)<BaseProps>`
  &:focus {
    border-color: ${({ primaryColor = color("brand") }) => primaryColor};
  }
`;

export const OptionsContainer = styled.div`
  background-color: ${color("white")};
  padding: ${space(2)} ${space(1)};
`;

type ButtonProps = {
  primaryColor?: string;
  selected?: boolean;
};

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

  color: ${({ selected, primaryColor = color("brand") }) =>
    selected ? primaryColor : color("text-dark")};

  &:hover {
    color: ${({ primaryColor = color("brand") }) => primaryColor};
    background: none;
  }
`;

export const MoreButton = styled(Button)<ButtonProps>`
  border: none;
  color: ${color("text-medium")};

  &:hover {
    color: ${({ primaryColor = color("brand") }) => primaryColor};
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
