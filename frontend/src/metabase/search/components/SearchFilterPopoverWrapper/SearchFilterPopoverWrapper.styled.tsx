import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Stack } from "metabase/ui";

export const SearchPopoverContainer = styled(Stack)`
  overflow: hidden;
  width: 100%;
`;
export const DropdownApplyButtonDivider = styled.hr<{ width?: string }>`
  border-width: 1px 0 0 0;
  border-style: solid;
  ${({ theme, width }) => {
    const dividerWidth = width ?? "100%";
    return css`
      border-color: ${theme.fn.themeColor("border")};
      width: ${dividerWidth};
    `;
  }}
`;
