import { css } from "@emotion/react";
import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";

import type { MenuItemProps } from "metabase/ui";
import { Menu } from "metabase/ui";

type MenuItemStyledProps = MenuItemProps & HTMLAttributes<HTMLButtonElement>;

export const MenuItemStyled = styled(Menu.Item)<MenuItemStyledProps>`
  ${({ "aria-selected": isSelected }) =>
    isSelected &&
    css`
      color: var(--mb-color-brand);
      background-color: var(--mb-color-brand-lighter);
    `}
`;
