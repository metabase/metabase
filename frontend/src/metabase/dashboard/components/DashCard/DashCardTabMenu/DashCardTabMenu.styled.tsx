import styled from "@emotion/styled";
import type { HTMLAttributes } from "react";
import { Menu } from "metabase/ui";

export const ItemWithMaxWidth = styled(Menu.Item)<
  HTMLAttributes<HTMLButtonElement>
>`
  max-width: 75ch;
  & div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`;
