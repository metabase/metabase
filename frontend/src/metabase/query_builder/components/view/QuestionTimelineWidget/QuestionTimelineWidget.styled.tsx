import styled from "@emotion/styled";

import { color } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const TimelineIcon = styled(Icon)`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
