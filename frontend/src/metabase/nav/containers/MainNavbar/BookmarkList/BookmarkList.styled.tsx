import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { SidebarLink } from "../SidebarItems";

export const SidebarBookmarkItem = styled(SidebarLink)`
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
`;
