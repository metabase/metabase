import styled from "@emotion/styled";
import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";

export const SelectFilterButton = styled(SelectButton)`
  min-height: 2.25rem;

  &:not(:first-of-type) {
    margin-top: 0.75rem;
  }
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
