import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";
import { breakpointMinHeightMedium } from "metabase/styled-components/theme";

import SelectButton from "metabase/core/components/SelectButton";
import FilterPopover from "../../FilterPopover";
import Select from "metabase/core/components/Select";

type SelectFilterButtonProps = {
  isActive?: boolean;
  hasValue?: boolean;
};

const lightSelectButton = ({ hasValue, isActive }: SelectFilterButtonProps) => `
    height: 40px;
    ${breakpointMinHeightMedium} {
      height: 56px;
    }
    padding: 0.5rem 1rem;

    background-color: ${hasValue ? alpha("brand", 0.2) : "transparent"};
    color: ${hasValue ? color("brand") : color("text-light")};
    border-color: ${
      isActive ? color("brand") : hasValue ? "transparent" : color("border")
    };

    .Icon {
      color: ${hasValue ? color("brand") : color("text-light")};
    }
`;

export const SelectFilterButton = styled(SelectButton)<SelectFilterButtonProps>`
  ${({ hasValue, isActive }) => lightSelectButton({ hasValue, isActive })}
`;

export const SegmentSelect = styled(Select)<SelectFilterButtonProps>`
  button {
    ${({ hasValue, isActive }) => lightSelectButton({ hasValue, isActive })}
  }
`;

export const SelectFilterPopover = styled(FilterPopover)`
  overflow-y: auto;
`;
