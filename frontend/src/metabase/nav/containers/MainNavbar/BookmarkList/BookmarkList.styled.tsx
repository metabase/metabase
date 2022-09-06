import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import { SidebarLink } from "../SidebarItems";

type SidebarBookmarkItem = {
  isSorting: boolean;
};

export const DragIcon = styled(Icon)`
  left: 2px;
  opacity: 0;
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  cursor: grab;
`;

export const SidebarBookmarkItem = styled(SidebarLink)<SidebarBookmarkItem>`
  padding-left: 0.75rem;
  position: relative;

  &:hover {
    button {
      color: ${color("brand")};
      opacity: 0.5;

      > svg:focus {
        outline: none;
      }
    }

    > svg {
      opacity: 0.3;
    }
  }

  button {
    opacity: 0;
    color: ${props =>
      props.isSelected ? color("text-white") : color("brand")};
    cursor: pointer;
    margin-top: 3px;

    > svg:focus {
      outline: none;
    }
  }

  ${props =>
    props.isSorting &&
    css`
      &:hover {
        background: white;

        svg {
          color: ${color("brand-light")} !important;
        }

        button {
          opacity: 0;
        }
      }
    `}
`;
