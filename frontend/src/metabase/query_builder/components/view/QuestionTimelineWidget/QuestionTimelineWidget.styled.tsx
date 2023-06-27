import { styled } from "metabase/ui/utils";
import { Icon } from "metabase/core/components/Icon";
import { color } from "metabase/lib/colors";

export const TimelineIcon = styled(Icon)`
  width: 1.25rem;
  height: 1.25rem;
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
