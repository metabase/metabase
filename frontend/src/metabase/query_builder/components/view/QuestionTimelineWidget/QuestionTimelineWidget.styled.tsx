import styled from "@emotion/styled";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";

export const TimelineIcon = styled(Icon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
