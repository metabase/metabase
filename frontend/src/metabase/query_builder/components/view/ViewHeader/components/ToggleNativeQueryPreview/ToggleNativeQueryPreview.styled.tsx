import styled from "@emotion/styled";

import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { color } from "metabase/lib/colors";

export const SqlButton = styled(IconButtonWrapper)`
  color: ${color("text-dark")};
  padding: 0.5rem;

  &:hover {
    color: ${color("brand")};
    background-color: ${color("bg-medium")};
  }
`;
