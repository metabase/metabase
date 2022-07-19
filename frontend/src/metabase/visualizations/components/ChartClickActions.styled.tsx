import styled from "@emotion/styled";
import { css } from "@emotion/react";
import { Link } from "react-router";
import { alpha, color } from "metabase/lib/colors";

export interface ClickActionLinkProps {
  type: "sort" | "formatting" | "horizontal" | "token" | "token-filter";
}

export const ClickActionLink = styled(Link)<ClickActionLinkProps>`
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
