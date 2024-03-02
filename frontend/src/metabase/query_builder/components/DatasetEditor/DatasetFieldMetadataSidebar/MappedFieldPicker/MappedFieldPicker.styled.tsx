import { css } from "@emotion/react";
import styled from "@emotion/styled";

import SelectButton from "metabase/core/components/SelectButton";
import { color } from "metabase/lib/colors";

export const StyledSelectButton = styled(SelectButton)`
  ${props =>
    props.hasValue &&
    css`
      color: ${color("text-white")} !important;
      background-color: ${color("brand")};
      border-color: ${color("brand")};

      .Icon {
        color: ${color("text-white")};
      }
    `};
`;
