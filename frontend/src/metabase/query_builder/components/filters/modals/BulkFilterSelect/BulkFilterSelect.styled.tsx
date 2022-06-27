import styled from "@emotion/styled";
import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";
import Select from "metabase/core/components/Select";

export const SelectFilterButton = styled(SelectButton)`
  grid-column: 2;
  min-height: 2.25rem;

  &:not(:first-of-type) {
    margin-top: 0.75rem;
  }
`;

export const SegmentSelect = styled(Select)`
  min-height: 2.25rem;
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
