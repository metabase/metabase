import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const TimelineIcon = styled(Icon)`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
