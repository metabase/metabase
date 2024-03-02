import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const RevokeIconWrapper = styled(IconButtonWrapper)`
  color: ${color("text-light")};
  padding: 0;

  &:hover {
    color: ${color("text-medium")};
  }
`;
