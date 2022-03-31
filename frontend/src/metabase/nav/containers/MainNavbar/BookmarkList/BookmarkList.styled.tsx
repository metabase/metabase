import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

import { SidebarLink } from "../SidebarItems";

export const SidebarBookmarkItem = styled(SidebarLink)`
  padding-left: ${space(1)};

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
