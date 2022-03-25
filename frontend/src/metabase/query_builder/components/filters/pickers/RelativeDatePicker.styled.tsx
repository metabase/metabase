import { color, alpha } from "metabase/lib/colors";
import styled from "@emotion/styled";
import { space } from "metabase/styled-components/theme";

import Button from "metabase/core/components/Button";

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

  margin-bottom: ${space(2)};
  margin-right: ${space(1)};
  padding-top: ${space(1)};
  padding-bottom: ${space(1)};

  &:hover {
    color: white;
    background-color: ${props => props.primaryColor || color("brand")};
  }
`;

export const CurrentContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  padding: ${space(1)};
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

export const OptionButton = styled(Button)<ButtonProps>`
  display: block;
  border: none;

  color: ${({ selected, primaryColor = defaultColor }) =>
    selected ? primaryColor : color("text-dark")};

  &:hover {
    color: ${({ primaryColor = defaultColor }) => primaryColor};
    background: none;
  }
`;

export const MoreButton = styled(Button)<ButtonProps>`
  border: none;
  margin-left: ${space(2)};
  color: ${color("text-dark")};

  &:hover {
    color: ${({ primaryColor = defaultColor }) => primaryColor};
  }
`;
