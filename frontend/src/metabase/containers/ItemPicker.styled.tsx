import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const ItemRoot = styled.div`
  margin-top: 0.5rem;
  padding: 0.5rem;
`;

export const ItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const ItemPickerHeader = styled.div`
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
`;

export const ItemPickerList = styled.div`
  overflow-y: auto;
`;

export interface ExpandItemIconProps {
  canSelect: boolean;
}

export const ExpandItemIcon = styled(Icon)<ExpandItemIconProps>`
  padding: 0.5rem;
  margin-left: auto;
  border-radius: 99px;
  color: ${color("text-light")};
  border: 1px solid ${color("border")};
  cursor: pointer;

  &:hover {
    background-color: ${props =>
      props.canSelect ? color("white") : color("brand")};
  }
`;
