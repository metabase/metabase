import styled from "@emotion/styled";
import { Box } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const PickerColumn = styled(Box)`
  flex-basis: 310px;
  padding: 1rem 1rem 1rem 1.5rem;
`;

export const ListBox = styled(Box)`
  border-right: 1px solid ${color("border")};
  height: 100%;
  width: 365px;
  flex-basis: 365px;
  background-color: ${color("bg-light")};

  &:last-child {
    border-right: none;
    background-color: white;
  }
`;
