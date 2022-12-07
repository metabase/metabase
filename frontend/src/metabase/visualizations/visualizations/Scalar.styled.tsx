import styled from "@emotion/styled";
import { css } from "@emotion/react";
import Ellipsified from "metabase/core/components/Ellipsified";
import { color } from "metabase/lib/colors";

export interface ScalarContainerProps {
  isClickable: boolean;
}

export const ScalarContainer = styled(Ellipsified)<ScalarContainerProps>`
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
