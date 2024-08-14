import { css } from "@emotion/react";
import styled from "@emotion/styled";

import SelectButton from "metabase/core/components/SelectButton";

export const StyledSelectButton = styled(SelectButton)`
  ${props =>
    props.hasValue &&
    css`
      color: var(--mb-color-text-white) !important;
      background-color: var(--mb-color-brand);
      border-color: var(--mb-color-brand);

      .Icon {
        color: var(--mb-color-text-white);
      }
    `};
`;
