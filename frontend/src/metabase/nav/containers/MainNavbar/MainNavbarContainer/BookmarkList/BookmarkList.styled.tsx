import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";

import { DraggableSidebarLink } from "../../SidebarItems";

export const SidebarBookmarkItem = styled(DraggableSidebarLink)`
  padding-left: 0.75rem;

  &:hover {
    button {
      color: #fff;
      background: #587330;
      opacity: 0.5;

      > svg:focus {
        outline: none;
      }
    }
    color: #fff;
    svg {
      fill: #fff !important;
    }
  }

  button {
    opacity: 0;
    color: #76797d;
    cursor: pointer;
    margin-top: 3px;

    > svg:focus {
      outline: none;
    }
  }
`;
