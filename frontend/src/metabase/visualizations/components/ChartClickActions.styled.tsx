import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { alpha, color } from "metabase/lib/colors";

export interface ClickActionTokenProps {
  type: "sort" | "formatting" | "horizontal" | "token" | "token-filter";
}

export const ClickActionToken = styled.div<ClickActionTokenProps>`
  ${({ type }) =>
    type === "token-filter" &&
    css`
      color: ${color("filter")};
      line-height: 16px;
      padding: 2px 16px;
      border: 1px solid ${alpha("filter", 0.5)};
      border-radius: 100px;

      &:hover {
        background-color: ${color("filter")};
      }
    `}
`;
