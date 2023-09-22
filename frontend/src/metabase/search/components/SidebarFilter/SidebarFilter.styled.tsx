import styled from "@emotion/styled";
import { css } from "@emotion/react";
import type { HTMLAttributes } from "react";
import type { ButtonProps } from "metabase/ui";
import { Button, Stack } from "metabase/ui";
import FieldSet from "metabase/components/FieldSet";
import EventSandbox from "metabase/components/EventSandbox";

export const DropdownFieldSet = styled(FieldSet)<{
  fieldHasValueOrFocus?: boolean;
}>`
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;

  border: 2px solid
    ${({ theme, fieldHasValueOrFocus }) =>
      fieldHasValueOrFocus ? theme.colors.brand[1] : theme.colors.border[0]};

  margin: 0;
  padding: 0.5rem 0.75rem;

  cursor: pointer;

  legend {
    min-width: 0;
    max-width: 100%;
    white-space: nowrap;
    text-overflow: ellipsis;

    text-transform: none;
    position: relative;
    height: 2px;
    line-height: 0;
    margin-left: -0.45em;
    padding: 0 0.5em;
  }

  &,
  legend {
    color: ${({ theme, fieldHasValueOrFocus }) =>
      fieldHasValueOrFocus && theme.colors.brand[1]};
  }
`;

export const DropdownClearButton = styled(Button)<
  ButtonProps & HTMLAttributes<HTMLButtonElement>
>`
  pointer-events: all;
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

export const SearchEventSandbox = styled(EventSandbox)`
  display: contents;
`;

export const SearchPopoverContainer = styled(Stack)`
  overflow: hidden;
`;
