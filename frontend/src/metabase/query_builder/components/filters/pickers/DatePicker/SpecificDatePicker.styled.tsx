import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const CalendarIcon = styled(Icon)`
  margin-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
  }
`;
