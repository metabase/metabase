import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const EmptyStateContainer = styled.div`
  padding: 2rem 2rem 0 2rem;
`;

interface OptionListProps {
  isDashboardFilter?: boolean;
}

interface FilterInputProps {
  isDashboardFilter?: boolean;
}

export const FilterInputContainer = styled.div<FilterInputProps>`
  margin-bottom: ${props => (props.isDashboardFilter ? "0" : "0.5rem")};
`;

export const OptionsList = styled.ul<OptionListProps>`
  overflow: auto;
  list-style: none;
  max-height: ${props => (props.isDashboardFilter ? "300px" : "none")};
  padding: 0.5rem 0 0;
`;

export const OptionContainer = styled.li`
  padding: 0;
`;

interface OptionItemProps {
  selected?: boolean;
  selectedColor: string;
}

export const OptionItem = styled.div<OptionItemProps>`
  border-radius: 4px;
  cursor: pointer;
  display: inline-block;
  margin: 0;
  padding: 0.5rem 0.6rem;
  width: 100%;
  background-color: ${props =>
    color(props.selected ? props.selectedColor : color("white"))};
  color: ${props => color(props.selected ? "white" : color("text"))};

  &:hover {
    background-color: ${props =>
      color(props.selected ? props.selectedColor : color("bg-light"))};
  }
`;
