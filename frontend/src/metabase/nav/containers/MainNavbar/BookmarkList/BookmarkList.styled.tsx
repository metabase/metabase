import styled from "@emotion/styled";

import Icon from "metabase/components/Icon";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { SidebarLink } from "../SidebarItems";

export const BookmarkTypeIcon = styled(Icon)`
  margin-right: 6px;
  opacity: 0.5;
`;

export const SidebarBookmarkItem = styled(SidebarLink)`
  &:hover {
    button {
      opacity: 0.5;
    }
  }

  button {
    opacity: 0;
    color: ${props =>
      props.isSelected ? color("text-white") : color("brand")};
    cursor: pointer;
    margin-right: ${space(0)};
  }
`;
