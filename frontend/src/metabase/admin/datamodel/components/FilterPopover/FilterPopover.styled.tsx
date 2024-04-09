import styled from "@emotion/styled";

import BaseButton from "metabase/core/components/Button";
import { color, alpha } from "metabase/lib/colors";

type Props = {
  primaryColor?: string;
};

export const Button = styled(BaseButton)<Props>`
  color: white;
  border-color: ${({ primaryColor = color("brand") }) => primaryColor};
  background-color: ${({ primaryColor = color("brand") }) => primaryColor};

  &:hover,
  &:focus {
    color: white;
    border-color: ${({ primaryColor = color("brand") }) => primaryColor};
    background-color: ${({ primaryColor = color("brand") }) =>
      alpha(primaryColor, 0.8)};
  }
`;

export const FilterPopoverSeparator = styled.hr`
  border: 0;
  height: 0;
  border-top: 1px solid ${color("border")};
`;

// Mimics the PopoverS.PopoverBodyMarginBottom class in Popover.css that the other
// filter pickers use to keep the PopoverFooter from overlapping with the
// content of the picker.
export const EmptyFilterPickerPlaceholder = styled.div`
  margin-bottom: 60px;
`;
