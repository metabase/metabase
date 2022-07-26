import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { breakpointMinHeightMedium } from "metabase/styled-components/theme";

import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";
import Select from "metabase/core/components/Select";

type SelectFilterButtonProps = {
  isActive?: boolean;
};

export const SelectFilterButton = styled(SelectButton)<SelectFilterButtonProps>`
  grid-column: 2;
  height: 40px;
  ${breakpointMinHeightMedium} {
    height: 56px;
  }

  ${({ isActive }) => (isActive ? `border-color: ${color("brand")};` : "")}

  &:not(:first-of-type) {
    margin-top: 0.75rem;
  }
`;

export const SegmentSelect = styled(Select)`
  height: 40px;
  ${breakpointMinHeightMedium} {
    height: 56px;
  }
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
