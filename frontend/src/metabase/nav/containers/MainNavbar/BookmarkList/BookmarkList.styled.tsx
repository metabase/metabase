import styled from "@emotion/styled";
import { css } from "@emotion/react";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { SidebarLink } from "../SidebarItems";

type SidebarBookmarkItem = {
  isSorting: boolean;
};

export const SidebarBookmarkItem = styled(SidebarLink)<SidebarBookmarkItem>`
  padding-left: 0.75rem;

  &:hover {
    button {
      color: ${color("brand")};
      opacity: 0.5;

      > svg:focus {
        outline: none;
      }
    }
  }

  button {
    opacity: 0;
    color: ${props =>
      props.isSelected ? color("text-white") : color("brand")};
    cursor: pointer;
    margin-top: 3px;
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
