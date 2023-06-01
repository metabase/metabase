import { css } from "@emotion/react";
import { color } from "metabase/lib/colors";

export const title = css`
  color: ${color("text-dark")};
  font-size: 1.25rem;
  font-weight: 700;
  line-height: 1.5rem;
  text-align: center;
`;

export const panel = css`
  margin-top: 2.5rem;
`;

export const actionList = css`
  margin-top: 3.5rem;
`;

export const actionListItem = css`
  margin-top: 2rem;
  text-align: center;
`;
