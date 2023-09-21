import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Stack } from "metabase/ui";
import { ParameterFieldSet } from "metabase/parameters/components/ParameterWidget/ParameterWidget.styled";

export const DropdownFilterElement = styled(ParameterFieldSet)`
  height: 40px;

  ${({ theme, fieldHasValueOrFocus }) => {
    return (
      fieldHasValueOrFocus &&
      css`
        border-color: ${theme.colors.brand[1]};
        color: ${theme.colors.brand[1]};
      `
    );
  }}
  &:hover {
    ${({ theme }) => {
      return css`
        background-color: ${theme.colors.bg[1]};
        transition: background-color 0.3s;
        cursor: pointer;
      `;
    }}
  }

  @media screen and (min-width: 440px) {
    margin-right: 0;
  }
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

export const SearchPopoverContainer = styled(Stack)`
  overflow: hidden;
`;
