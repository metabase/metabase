import styled from "@emotion/styled";

import Label from "metabase/components/type/Label";
import { color, lighten } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

import { PermissionsSelectOption } from "./PermissionsSelectOption";

export const PermissionsSelectRoot = styled.div`
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

export const PermissionsSelectText = styled(Label)`
  flex-grow: 1;
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

export const DisabledPermissionOption = styled(PermissionsSelectOption)`
  color: ${props =>
    props.isHighlighted ? color("text-medium") : color("text-light")};
`;
