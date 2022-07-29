import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export interface ItemRootProps {
  canSelect: boolean;
  isSelected: boolean;
  hasChildren: boolean;
}

export const ItemRoot = styled.div<ItemRootProps>`
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.5rem;

  ${({ isSelected }) =>
    isSelected &&
    css`
      color: ${color("white")};
      background-color: ${color("brand")};
    `}

  ${({ canSelect, hasChildren }) =>
    (canSelect || hasChildren) &&
    css`
      cursor: pointer;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};
      }
    `}
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
