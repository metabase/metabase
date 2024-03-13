import styled from "@emotion/styled";

import Button from "metabase/core/components/Button";
import { color } from "metabase/lib/colors";

export const ButtonGroupRoot = styled.div`
  display: inline-block;

  ${Button.Root} {
    border: 1px solid ${color("border")};

    &:not(:last-of-type) {
      border-inline-end-width: 0.5px;
      border-start-end-radius: 0;
      border-end-end-radius: 0;
    }

    &:not(:first-of-type) {
      border-left-width: 0.5px;
      border-start-start-radius: 0;
      border-end-start-radius: 0;
    }
  }
`;
