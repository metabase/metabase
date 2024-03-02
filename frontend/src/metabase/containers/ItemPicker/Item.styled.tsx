import { css } from "@emotion/react";
import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export interface ItemRootProps {
  canSelect: boolean;
  isSelected: boolean;
  hasChildren?: boolean;
}

export const ItemIcon = styled(Icon)``;

export const ItemRoot = styled.div<ItemRootProps>`
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.5rem;

  ${({ isSelected }) =>
    isSelected &&
    css`
      color: ${color("white")};
      background-color: ${color("brand")};

      & ${ExpandButton} {
        color: ${color("white")};
      }
    `}

  ${({ canSelect, hasChildren }) =>
    (canSelect || hasChildren) &&
    css`
      cursor: pointer;

      &:hover {
        color: ${color("white")};
        background-color: ${color("brand")};

        & ${ExpandButton} {
          /**
           * If the item can't be selected, show the ExpandButton's hovered
           * state to indicate that the ExapndButton's click handler will be
           * called if the user clicks on the item.
           */
          color: ${canSelect ? color("white") : color("brand")};
          background-color: ${canSelect ? color("brand") : color("white")};

          &:hover {
            color: ${color("brand")};
            & ${ItemIcon} {
              color: ${color("brand")};
            }
            background-color: ${color("white")};
          }
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
`;

ExpandButton.defaultProps = {
  circle: true,
};
