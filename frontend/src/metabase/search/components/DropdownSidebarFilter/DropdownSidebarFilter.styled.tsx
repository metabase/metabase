import styled from "@emotion/styled";
import { Group } from "metabase/ui";

import FieldSet from "metabase/components/FieldSet";
import EventSandbox from "metabase/components/EventSandbox";
import { Icon } from "metabase/core/components/Icon";

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

export const DropdownLabelIcon = styled(Icon)`
  overflow: visible;
`;
export const GroupOverflowHidden = styled(Group)`
  overflow: hidden;
`;

export const SearchEventSandbox = styled(EventSandbox)`
  display: contents;
`;
