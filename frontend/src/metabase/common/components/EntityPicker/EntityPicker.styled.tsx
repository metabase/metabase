import styled from "@emotion/styled";
import { Box } from "metabase/ui";
import { color } from "metabase/lib/colors";

export const PickerColumn = styled(Box)<{
  activeList: boolean;
}>`
  flex-basis: 310px;
  border-right: 1px solid ${color("border")};
  padding: 1rem;
  background-color: ${({ activeList }) =>
    activeList ? color("white") : color("bg-light")};
`;
