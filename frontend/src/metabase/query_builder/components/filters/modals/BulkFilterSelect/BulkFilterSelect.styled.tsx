import styled from "@emotion/styled";
import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";

export const SelectFilterButton = styled(SelectButton)`
  min-height: 1.0625rem;
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
