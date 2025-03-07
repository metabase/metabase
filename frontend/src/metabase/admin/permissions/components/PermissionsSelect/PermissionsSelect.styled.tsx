// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { color, lighten } from "metabase/lib/colors";
import { Icon, type IconProps } from "metabase/ui";

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
    color: var(--mb-color-filter);
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
    color: var(--mb-color-text-white);
    background-color: ${() => lighten("accent7", 0.1)};
  }
`;

export const ActionsList = styled(OptionsList)`
  border-top: 1px solid var(--mb-color-border);
`;

export const ToggleContainer = styled.div`
  display: flex;
  align-items: center;
  background-color: var(--mb-color-bg-medium);
  padding: 0.5rem 1rem;
  justify-content: flex-end;
`;

export const ToggleLabel = styled.label`
  font-size: 12px;
  margin-right: 1rem;
`;

export const WarningIcon = styled(
  forwardRef<SVGSVGElement, IconProps>(function WarningIcon(props, ref) {
    return (
      <Icon
        {...props}
        size={props.size ?? 18}
        name={props.name ?? "warning"}
        ref={ref}
      />
    );
  }),
)`
  margin-right: 0.25rem;
  color: var(--mb-color-text-light);
`;

export const DisabledPermissionOption = styled(PermissionsSelectOption)<{
  isHighlighted: boolean;
}>`
  color: ${props =>
    props.isHighlighted ? color("text-medium") : color("text-light")};
`;
