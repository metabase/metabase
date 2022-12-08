import styled from "@emotion/styled";

export const EmptyStateContainer = styled.div`
  padding: 2rem 2rem 0 2rem;
`;

interface FilterInputProps {
  isDashboardFilter?: boolean;
}

export const FilterInputContainer = styled.div<FilterInputProps>`
  margin-bottom: ${props => (props.isDashboardFilter ? "0" : "0.5rem")};
`;

interface OptionListProps {
  isDashboardFilter?: boolean;
}

export const OptionsList = styled.ul<OptionListProps>`
  overflow: auto;
  list-style: none;
  max-height: ${props => (props.isDashboardFilter ? "300px" : "none")};
  padding: ${props => (props.isDashboardFilter ? "0.5rem" : "0")};
`;

export const OptionContainer = styled.li`
  padding: 0.5rem 0.125rem;
`;

export const LabelWrapper = styled.div`
  padding-left: 0.5rem;
`;
