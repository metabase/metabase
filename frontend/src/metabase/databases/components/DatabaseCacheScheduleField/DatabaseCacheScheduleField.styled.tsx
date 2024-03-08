import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

export const ScheduleOptionList = styled.div`
  border: 1px solid ${color("border")};
  box-shadow: 0 2px 2px ${color("shadow")};
`;

interface ScheduleOptionRootProps {
  isSelected: boolean;
}

export const ScheduleOptionRoot = styled.div<ScheduleOptionRootProps>`
  display: flex;
  cursor: ${props => !props.isSelected && "pointer"};
  padding: 1.5rem 1rem;
  border-bottom: 1px solid ${color("border")};

  &:last-child {
    border-bottom: none;
  }
`;

interface ScheduleOptionIndicatorProps {
  isSelected: boolean;
}

export const ScheduleOptionIndicator = styled.div<ScheduleOptionIndicatorProps>`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 1.125rem;
  height: 1.125rem;
  border: 0.125rem solid
    ${props => (props.isSelected ? color("brand") : color("text-light"))};
  border-radius: 50%;
`;

interface ScheduleOptionIndicatorBackgroundProps {
  isSelected: boolean;
}

export const ScheduleOptionIndicatorBackground = styled.div<ScheduleOptionIndicatorBackgroundProps>`
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background-color: ${props => props.isSelected && color("brand")};
`;

export const ScheduleOptionBody = styled.div`
  margin-left: 1rem;
`;

interface ScheduleOptionTitleProps {
  isSelected: boolean;
}

export const ScheduleOptionTitle = styled.div<ScheduleOptionTitleProps>`
  color: ${props => (props.isSelected ? color("brand") : color("text-medium"))};
  font-size: 1rem;
  font-weight: bold;
  line-height: 1.25rem;
`;

export const ScheduleOptionContent = styled.div`
  margin-top: 1rem;
`;

export const ScheduleOptionText = styled.div`
  color: ${color("text-medium")};
  font-size: 1rem;
  line-height: 1.5rem;
  max-width: 38.75rem;
`;
