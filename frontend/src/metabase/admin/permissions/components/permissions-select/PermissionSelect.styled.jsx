import styled from "styled-components";
import Label from "metabase/components/type/Label";
import { color } from "metabase/lib/colors";

export const PermissionSelectRoot = styled.div`
  display: flex;
  align-items: center;
  width: 180px;
  cursor: pointer;
`;

export const PermissionSelectText = styled(Label)`
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
    background-color: ${color("brand")};
  }
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
