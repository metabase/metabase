// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";

import { EventSandbox } from "metabase/common/components/EventSandbox";
import { FieldSet } from "metabase/common/components/FieldSet";
import { Group, Icon } from "metabase/ui";

export const DropdownFieldSet = styled(FieldSet)<{
  fieldHasValueOrFocus?: boolean;
}>`
  min-width: 0;
  text-overflow: ellipsis;
  border: 2px solid
    ${({ fieldHasValueOrFocus }) =>
      fieldHasValueOrFocus
        ? "var(--mb-color-brand)"
        : "var(--mb-color-border)"};
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
    color: ${({ fieldHasValueOrFocus }) =>
      fieldHasValueOrFocus && "var(--mb-color-brand)"};
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
