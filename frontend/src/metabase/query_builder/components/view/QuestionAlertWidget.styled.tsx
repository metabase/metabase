import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";

export const AlertIcon = styled(Icon)`
  cursor: pointer;

  &:hover {
    color: ${color("brand")};
  }
`;
