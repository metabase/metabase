import styled from "@emotion/styled";

import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

import { PermissionsSelectOption } from "./PermissionsSelectOption";

export const PermissionsSelectRoot = styled.div<{ isDisabled: boolean }>`
  display: flex;
  align-items: center;
  min-width: 180px;
  cursor: ${props => (props.isDisabled ? "default" : "pointer")};
`;

export const SelectedOption = styled(PermissionsSelectOption)`
  transition: color 200ms;

  &:hover {
    color: ${color("filter")};
  }
`;

export const OptionsList = styled.ul`
  min-width: 210px;
  padding: 0.5rem 0;
`;

export const OptionsListItem = styled.li`
  cursor: pointer;
  padding: 0.5rem 1rem;

  &:hover {
    color: ${color("white")};
    background-color: ${lighten("accent7", 0.1)};
  }
`;

export const ActionsList = styled(OptionsList)`
  border-top: 1px solid ${color("border")};
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: ${color("bg-medium")};
  padding: 0.5rem 1rem;
  justify-content: flex-end;
`;

export const ToggleLabel = styled.label`
  font-size: 12px;
  margin-right: 1rem;
`;

export const WarningIcon = styled(Icon)`
  margin-right: 0.25rem;
  color: ${color("text-light")};
`;

WarningIcon.defaultProps = {
  size: 18,
  name: "warning",
};

export const DisabledPermissionOption = styled(PermissionsSelectOption)<{
  isHighlighted: boolean;
}>`
  color: ${props =>
    props.isHighlighted ? color("text-medium") : color("text-light")};
`;
