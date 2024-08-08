import styled from "@emotion/styled";
import type { AnchorHTMLAttributes } from "react";

import { color } from "metabase/lib/colors";
import type { AnchorProps } from "metabase/ui";
import { Anchor } from "metabase/ui";

export const FormLauncher = styled(Anchor)<
  AnchorProps & AnchorHTMLAttributes<HTMLAnchorElement>
>`
  font-weight: bold;

  &:hover,
  &:active {
    color: ${color("brand")};
    text-decoration: none;
  }
`;
