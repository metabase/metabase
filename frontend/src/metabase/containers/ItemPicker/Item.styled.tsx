import styled from "@emotion/styled";
import { css } from "@emotion/react";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Icon } from "metabase/ui";

import { color } from "metabase/ui/utils/colors";

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

  ${({ isSelected, theme }) =>
    isSelected &&
    css`
      color: ${theme.fn.themeColor("white")};
      background-color: ${theme.fn.themeColor("brand")};

      & ${ExpandButton} {
        color: ${theme.fn.themeColor("white")};
      }
    `}

  ${({ canSelect, hasChildren, theme }) =>
    (canSelect || hasChildren) &&
    css`
      cursor: pointer;

      &:hover {
        color: ${theme.fn.themeColor("white")};
        background-color: ${theme.fn.themeColor("brand")};

        & ${ExpandButton} {
          /**
           * If the item can't be selected, show the ExpandButton's hovered
           * state to indicate that the ExapndButton's click handler will be
           * called if the user clicks on the item.
           */
          color: ${canSelect
            ? theme.fn.themeColor("white")
            : theme.fn.themeColor("brand")};
          background-color: ${canSelect
            ? theme.fn.themeColor("brand")
            : theme.fn.themeColor("white")};

          &:hover {
            color: ${theme.fn.themeColor("brand")};
            & ${ItemIcon} {
              color: ${theme.fn.themeColor("brand")};
            }
            background-color: ${theme.fn.themeColor("white")};
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
