import styled from "@emotion/styled";
import type { MenuItemProps } from "metabase/ui";
import { Menu } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const DropdownIcon = styled(Icon)`
  margin-top: 2px;
  margin-left: 4px;
`;

interface SelectableMenuItemProps extends MenuItemProps {
  onClick?: () => void;
}

export const SelectableMenuItem = styled(Menu.Item)<SelectableMenuItemProps>`
  &[aria-selected="true"] {
    background-color: ${color("brand")};
    color: ${color("white")};

    &:hover {
      background-color: ${color("brand")};
      color: ${color("white")};
    }
  }
`;
