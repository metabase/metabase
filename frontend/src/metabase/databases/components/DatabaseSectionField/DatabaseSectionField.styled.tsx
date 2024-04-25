import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const SectionButton = styled(Button)`
  color: ${color("brand")};
  padding: 0;
  border: none;
  border-radius: 0;

  &:hover {
    background-color: transparent;
  }
`;
