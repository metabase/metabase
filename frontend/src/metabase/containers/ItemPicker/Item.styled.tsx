import styled from "@emotion/styled";
import { css } from "@emotion/react";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";

import { color } from "metabase/lib/colors";

export interface ItemRootProps {
  canSelect: boolean;
  isSelected: boolean;
  hasChildren?: boolean;
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

        & ${ExpandButton} {
          color: ${color("white")};
        }
      }
    `}
`;

export const ItemContent = styled.div`
  display: flex;
  align-items: center;
`;

export const ItemTitle = styled.h4`
  margin-left: 0.5rem;
  margin-right: 0.5rem;
`;

export const ExpandButton = styled(IconButtonWrapper)<{ canSelect: boolean }>`
  padding: 0.5rem;
  margin-left: auto;

  color: ${color("text-light")};
  border: 1px solid ${color("border")};

  &:hover {
    color: ${color("brand")} !important;
    background-color: ${props =>
      props.canSelect ? color("white") : color("brand")};
  }
`;

ExpandButton.defaultProps = {
  circle: true,
};
