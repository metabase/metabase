import styled from "@emotion/styled";
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
