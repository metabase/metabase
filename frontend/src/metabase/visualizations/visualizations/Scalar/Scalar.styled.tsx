import { css } from "@emotion/react";
import styled from "@emotion/styled";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";
import { Icon } from "metabase/ui";

export interface ScalarContainerProps {
  isClickable: boolean;
}

export const ScalarContainer = styled(Ellipsified)<ScalarContainerProps>`
  padding: 0 ${space(1)};
  max-width: 100%;

  ${({ isClickable }) =>
    isClickable &&
    css`
      cursor: pointer;

      &:hover {
        color: ${color("brand")};
      }
    `}
`;

export const LabelIcon = styled(Icon)`
  color: ${color("text-light")};
  margin-top: 0.2rem;
`;
