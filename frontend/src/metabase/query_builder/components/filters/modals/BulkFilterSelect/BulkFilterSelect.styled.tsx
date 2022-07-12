import styled from "@emotion/styled";
import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";
import Select from "metabase/core/components/Select";

export const SelectFilterButton = styled(SelectButton)`
  grid-column: 2;
  height: 2.25rem;
  max-width: 500px; // to match inputs

  &:not(:first-of-type) {
    margin-top: 0.75rem;
  }
`;

export const SegmentSelect = styled(Select)`
  height: 2.25rem;
  max-width: 500px; // to match inputs
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
