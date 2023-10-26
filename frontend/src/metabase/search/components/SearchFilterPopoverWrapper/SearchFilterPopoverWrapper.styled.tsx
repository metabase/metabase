import styled from "@emotion/styled";
import { css } from "@emotion/react";
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
      border-color: ${theme.colors.border[0]};
      width: ${dividerWidth};
    `;
  }}
`;
