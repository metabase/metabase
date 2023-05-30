import styled from "@emotion/styled";
import { color, alpha } from "metabase/lib/colors";

import { SelectButton } from "metabase/core/components/SelectButton";
import { Select } from "metabase/core/components/Select";
import FilterPopover from "../../FilterPopover";

type SelectFilterButtonProps = {
  isActive?: boolean;
  hasValue?: boolean;
};

const lightSelectButton = ({ hasValue, isActive }: SelectFilterButtonProps) => `
    padding: 0.5rem 1rem;
    height: 40px;

    background-color: ${hasValue ? alpha("brand", 0.2) : color("white")};
    color: ${hasValue ? color("brand") : color("text-medium")};
    border-color: ${
      isActive ? color("brand") : hasValue ? "transparent" : color("border")
    };

    .Icon {
      color: ${hasValue ? color("brand") : color("text-medium")};
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
