import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const CalendarIcon = styled(Icon)`
  margin-right: 0.5rem;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
  }
`;

export const TimeLabel = styled.div`
  display: flex;
  align-items: center;
  cursor: pointer;

  &:hover {
    color: ${color("filter")};
  }
`;
