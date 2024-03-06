import styled from "@emotion/styled";
import { color } from "metabase/ui/utils/colors";
import { Icon } from "metabase/ui";

export const AlertIcon = styled(Icon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
