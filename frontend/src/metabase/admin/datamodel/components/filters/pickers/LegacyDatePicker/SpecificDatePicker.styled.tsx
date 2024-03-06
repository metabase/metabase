import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";

export const TimeLabel = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
  }
`;
