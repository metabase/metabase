import styled from "@emotion/styled";

import EventSandbox from "metabase/components/EventSandbox";
import { FieldSet } from "metabase/components/FieldSet";
import { Group, Icon } from "metabase/ui";

export const DropdownFieldSet = styled(FieldSet)<{
  fieldHasValueOrFocus?: boolean;
}>`
  min-width: 0;
  text-overflow: ellipsis;
  overflow: hidden;
  border: 2px solid
    ${({ theme, fieldHasValueOrFocus }) =>
      fieldHasValueOrFocus
        ? theme.fn.themeColor("brand")
        : theme.fn.themeColor("border")};
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
      fieldHasValueOrFocus && theme.fn.themeColor("brand")};
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
