import styled from "@emotion/styled";
import TextInput from "metabase/components/TextInput";
import { color } from "metabase/lib/colors";

export const EmptyStateContainer = styled.div`
  padding: 2rem 2rem 0 2rem;
`;

interface FilterInputProps {
  isDashboardFilter?: boolean;
}

export const FilterInput = styled(TextInput)<FilterInputProps>`
  margin-bottom: ${props => (props.isDashboardFilter ? "0" : "0.5rem")};
  border: ${props =>
    props.isDashboardFilter ? `1px solid ${color("border")}` : "none"};
` as any;

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

interface OptionItemProps {
  selected?: boolean;
  selectedColor: string;
}

export const OptionItem = styled.div<OptionItemProps>`
  border-radius: var(--default-border-radius);
  display: inline-block;
  width: 100%;
  cursor: pointer;
  &:hover {
    background-color: ${props =>
      color(props.selected ? props.selectedColor : "var(--color-bg-light)")};
  }
  background-color: ${props =>
    color(props.selected ? props.selectedColor : "bg-white")};
`;
