import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { ParameterFieldSet } from "metabase/parameters/components/ParameterWidget/ParameterWidget.styled";
import { Group } from "metabase/ui";

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
export const DropdownApplyButtonDivider = styled.hr`
  ${({ theme }) => {
    return css`
      border-top: 1px solid ${theme.colors.border[0]};
    `;
  }}
`;

export const DropdownDisplayElement = styled(Group)`
  ${({ theme }) => {
    return css`
      color: ${theme.colors.brand[1]};
    `;
  }}
`;
