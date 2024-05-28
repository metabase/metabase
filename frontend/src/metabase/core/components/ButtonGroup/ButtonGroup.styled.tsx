import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ButtonGroupRoot = styled.div`
  display: inline-block;

  ${Button.Root} {
    border: 1px solid ${color("border")};

    &:not(:last-of-type) {
      border-right-width: 0.5px;
      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
    }

    &:not(:first-of-type) {
      border-left-width: 0.5px;
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
    }
  }
`;
