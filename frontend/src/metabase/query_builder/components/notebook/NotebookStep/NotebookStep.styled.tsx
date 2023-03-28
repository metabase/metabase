import styled from "@emotion/styled";
import Button from "metabase/core/components/Button";
import { alpha, darken, lighten } from "metabase/lib/colors";
import { breakpointMinSmall } from "metabase/styled-components/theme";

const getPercentage = (number: number): string => {
  return `${number * 100}%`;
};

export const StepRoot = styled.div`
  margin-bottom: 0.5rem;
  padding-bottom: 0.5rem;

  ${breakpointMinSmall} {
    margin-bottom: 1rem;
    padding-bottom: 1rem;
  }
`;

export interface StepHeaderProps {
  color?: string;
}

export const StepContent = styled.div`
  width: ${getPercentage(11 / 12)};

  ${breakpointMinSmall} {
    width: ${getPercentage(8 / 12)};
  }
`;

export const StepHeader = styled(StepContent)<StepHeaderProps>`
  display: flex;
  color: ${props => props.color};
  font-weight: bold;
  margin-bottom: 0.5rem;
`;

export const StepBody = styled.div`
  display: flex;
  align-items: center;
`;

export const StepButtonContainer = styled.div`
  width: ${getPercentage(1 / 12)};
`;

export const StepActionsContainer = styled.div`
  margin-top: 0.5rem;
`;

interface ColorButtonProps {
  color: string;
  transparent?: boolean;
}

export const ColorButton = styled(Button)<ColorButtonProps>`
  border: none;
  color: ${({ color }) => color};
  background-color: ${({ color, transparent }) =>
    transparent ? null : alpha(color, 0.2)};
  &:hover {
    color: ${({ color }) => darken(color, 0.115)};
    background-color: ${({ color, transparent }) =>
      transparent ? lighten(color, 0.5) : alpha(color, 0.35)};
  }
  transition: background 300ms;
`;
